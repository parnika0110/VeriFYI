/**
 * Runtime validation for VeriFYI's structured output.
 *
 * The LLM is treated as an untrusted component: everything it returns is
 * re-validated here before it may reach the frontend. This module is pure
 * TypeScript (no AI), so it can be unit-tested offline.
 *
 * Key anti-fabrication rule: if a claim is marked SUPPORTED but its evidence
 * is only "AI internal knowledge" (no real source), the validator DOWNGRADES
 * the claim to UNVERIFIED. The model is instructed not to fabricate evidence,
 * but we enforce it rather than trust it.
 */

import type {
  Claim,
  ClaimCategory,
  Evidence,
  EvidenceType,
  OverallStatus,
  VerificationResult,
  VerificationStatus,
} from "./contract";

/* ------------------------------------------------------------------ */
/* Allowed values                                                      */
/* ------------------------------------------------------------------ */

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "SUPPORTED",
  "UNVERIFIED",
  "CONTRADICTED",
] as const;

export const OVERALL_STATUSES: readonly OverallStatus[] = [
  "VERIFIED",
  "NEEDS_VERIFICATION",
  "HIGH_RISK",
] as const;

export const CLAIM_CATEGORIES: readonly ClaimCategory[] = [
  "COMPANY",
  "ROLE",
  "SALARY",
  "RECRUITER",
  "PAYMENT",
  "CONTACT",
  "DOMAIN",
  "DEADLINE",
  "OTHER",
] as const;

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  "USER_PROVIDED",
  "OFFICIAL",
  "SEARCH",
] as const;

/* Limits — also enforced on the API layer for the request itself. */
export const MAX_INPUT_LENGTH = 20_000;
export const MAX_CLAIMS = 15;
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_EXPLANATION_LENGTH = 2000;
export const MAX_CLAIM_TEXT_LENGTH = 1000;
export const MAX_ACTION_LENGTH = 500;
export const MAX_RELEVANT_TEXT_LENGTH = 500;
export const MAX_EVIDENCE_PER_CLAIM = 5;

/* ------------------------------------------------------------------ */
/* Small type-guard helpers                                            */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Collapse whitespace so multi-line model output cannot bloat the payload. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Find the first allowed value that matches (case-insensitive). */
function matchEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (!isString(value)) return null;
  const needle = value.trim().toUpperCase();
  return allowed.find((candidate) => candidate.toUpperCase() === needle) ?? null;
}

/* ------------------------------------------------------------------ */
/* Evidence sanitization                                               */
/* ------------------------------------------------------------------ */

/**
 * External-evidence switch. VeriFYI currently has NO external
 * verification/search subsystem, so OFFICIAL and SEARCH evidence cannot
 * legitimately exist yet: anything the model labels OFFICIAL/SEARCH was
 * manufactured by the model. Keep this false until real retrieval exists;
 * when it does, evidence must be injected by that subsystem, never by the
 * model.
 */
export const EXTERNAL_EVIDENCE_ENABLED = false;

/** Normalized form used for quote traceability checks. */
function normalizeForTrace(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `quote` genuinely appears in the user's submitted text.
 * Model claims of provenance are not trusted; the quote itself must be
 * traceable to the analyzed content.
 */
export function isTraceableQuote(quote: string, sourceText: string): boolean {
  if (!sourceText) return false;
  const haystack = normalizeForTrace(sourceText);
  const needle = normalizeForTrace(quote);
  return needle.length > 0 && haystack.includes(needle);
}

/**
 * Detect evidence the model invented from its own knowledge instead of
 * quoting the analyzed text. The analyzer prompt defines "AI internal
 * knowledge" as the sentinel source for this; it is stripped wherever it
 * appears, regardless of the claimed type.
 */
export function isAiInternalEvidence(source: string, _type: EvidenceType): boolean {
  const normalized = source.trim().toLowerCase();
  return normalized === "ai internal knowledge" || normalized.startsWith("ai internal knowledge");
}

/**
 * Sanitize one evidence item. Returns null (drop) when:
 *  - structure/enum invalid, or
 *  - the source is the "AI internal knowledge" sentinel, or
 *  - type is OFFICIAL/SEARCH while no external subsystem exists, or
 *  - type is USER_PROVIDED but relevantText does not trace to sourceText.
 */
function sanitizeEvidence(raw: unknown, sourceText: string): Evidence | null {
  if (!isRecord(raw)) return null;
  const { source, type, description, relevantText } = raw;

  if (!isString(source) || !isString(description)) return null;
  const evidenceType = matchEnum(type, EVIDENCE_TYPES);
  if (!evidenceType) return null;

  const cleanSource = truncate(normalizeWhitespace(source), 200);
  const cleanDescription = truncate(normalizeWhitespace(description), 500);

  if (!cleanSource || !cleanDescription) return null;
  if (isAiInternalEvidence(cleanSource, evidenceType)) return null;

  if (evidenceType === "USER_PROVIDED") {
    // USER_PROVIDED means "genuinely quoted from the submitted text".
    // Require a relevantText quote that actually exists in the source text.
    if (!isString(relevantText) || !isTraceableQuote(relevantText, sourceText)) {
      return null;
    }
  } else if (!EXTERNAL_EVIDENCE_ENABLED) {
    // No external verification subsystem yet -> model-invented OFFICIAL /
    // SEARCH citations (URLs, "Google careers website", ...) are not evidence.
    return null;
  }

  const evidence: Evidence = {
    source: cleanSource,
    type: evidenceType,
    description: cleanDescription,
  };

  if (isString(relevantText) && relevantText.trim().length > 0) {
    evidence.relevantText = truncate(relevantText.trim(), MAX_RELEVANT_TEXT_LENGTH);
  }

  return evidence;
}

function sanitizeEvidenceList(raw: unknown, sourceText: string): Evidence[] {
  if (!Array.isArray(raw)) return [];
  const out: Evidence[] = [];
  for (const item of raw) {
    if (out.length >= MAX_EVIDENCE_PER_CLAIM) break;
    const evidence = sanitizeEvidence(item, sourceText);
    if (evidence) out.push(evidence);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Claim validation                                                    */
/* ------------------------------------------------------------------ */

function validateClaim(raw: unknown, index: number, sourceText: string): Claim | null {
  if (!isRecord(raw)) return null;
  const { id, claim, category, status, confidence, explanation, evidence, recommendedAction } = raw;

  const claimText = isString(claim) ? normalizeWhitespace(claim) : "";
  const explanationText = isString(explanation) ? normalizeWhitespace(explanation) : "";
  if (!claimText || !explanationText) return null;

  const verifiedStatus = matchEnum(status, VERIFICATION_STATUSES);
  if (!verifiedStatus) return null;

  const verifiedCategory = matchEnum(category, CLAIM_CATEGORIES) ?? "OTHER";

  let claimId = isString(id) && id.trim() ? normalizeWhitespace(id).slice(0, 60) : `claim-${index + 1}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(claimId)) {
    claimId = `claim-${index + 1}`;
  }

  let confidenceValue = isFiniteNumber(confidence) ? confidence : 0.5;
  confidenceValue = clamp(confidenceValue, 0, 1);

  const cleanEvidence = sanitizeEvidenceList(evidence, sourceText);

  // ANTI-FABRICATION GATE:
  // A claim may only be SUPPORTED or CONTRADICTED if concrete evidence
  // survived sanitization. "The model is pretty sure" is not evidence.
  const finalStatus: VerificationStatus =
    verifiedStatus !== "UNVERIFIED" && cleanEvidence.length === 0
      ? "UNVERIFIED"
      : verifiedStatus;

  const finalConfidence = finalStatus !== verifiedStatus ? Math.min(confidenceValue, 0.6) : confidenceValue;

  const validatedClaim: Claim = {
    id: claimId,
    claim: truncate(claimText, MAX_CLAIM_TEXT_LENGTH),
    category: verifiedCategory,
    status: finalStatus,
    confidence: Math.round(finalConfidence * 100) / 100,
    explanation: truncate(explanationText, MAX_EXPLANATION_LENGTH),
    evidence: cleanEvidence,
  };

  if (isString(recommendedAction) && recommendedAction.trim()) {
    validatedClaim.recommendedAction = truncate(
      normalizeWhitespace(recommendedAction),
      MAX_ACTION_LENGTH,
    );
  }

  return validatedClaim;
}

/* ------------------------------------------------------------------ */
/* Overall status coherence                                            */
/* ------------------------------------------------------------------ */

/**
 * The overall status must be consistent with the per-claim statuses. If the
 * model disagrees with itself, we recompute from the claims. This keeps the
 * product honest: HIGH_RISK is always backed by a PAYMENT/CONTRADICTED claim.
 */
export function deriveOverallStatus(claims: Claim[], fallback: OverallStatus): OverallStatus {
  if (claims.length === 0) return fallback;

  const hasContradicted = claims.some((c) => c.status === "CONTRADICTED");
  const hasHighRiskPayment = claims.some(
    (c) =>
      c.category === "PAYMENT" &&
      (c.status === "CONTRADICTED" ||
        (c.status === "SUPPORTED" && assertsPaymentRequired(c.claim))),
  );
  const anySupported = claims.some((c) => c.status === "SUPPORTED");

  if (hasContradicted || hasHighRiskPayment) return "HIGH_RISK";
  if (anySupported) {
    // "VERIFIED" is reserved for results where every claim is evidence-backed
    // AND no payment is involved — anything touching money stays at least
    // NEEDS_VERIFICATION, because "the text says so" is not proof.
    const allSupported = claims.every((c) => c.status === "SUPPORTED");
    const hasPaymentClaim = claims.some((c) => c.category === "PAYMENT");
    return allSupported && !hasPaymentClaim ? "VERIFIED" : "NEEDS_VERIFICATION";
  }
  return fallback === "VERIFIED" ? "NEEDS_VERIFICATION" : fallback;
}

/**
 * True when a PAYMENT claim asserts that the applicant must pay something
 * (as opposed to e.g. "no payment is required"). Used to decide whether a
 * confirmed payment claim makes the overall result HIGH_RISK.
 */
export function assertsPaymentRequired(claimText: string): boolean {
  const positive =
    /\b(pay|payment|fee|fees|charge|charges|deposit|transfer|send money|onboarding cost|registration fee|requires?|request|demand)\b/i;
  // Negation only counts when it targets the payment language itself
  // ("no registration fee", "payment is never required", "fee is waived"),
  // not an unrelated "no" elsewhere in the sentence.
  const negationTargetingPayment =
    /\b(?:no|not|never|without|zero)\b[^.]{0,40}\b(?:fees?|payment|charges?|deposit|cost|pay|requires?|required)\b/i;
  const waivedLike = /\b(?:free|waived)\b/i;
  return (
    positive.test(claimText) &&
    !negationTargetingPayment.test(claimText) &&
    !waivedLike.test(claimText)
  );
}

/* ------------------------------------------------------------------ */
/* Top-level validation                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate (and sanitize) a parsed model response into a VerificationResult.
 * `sourceText` is the user's submitted text: USER_PROVIDED evidence must be
 * traceable to it. Omitting it strips ALL evidence (fail-closed).
 * Returns null when the response is structurally unusable.
 */
export function validateVerificationResult(
  parsed: unknown,
  sourceText = "",
): VerificationResult | null {
  if (!isRecord(parsed)) return null;
  const { overallStatus, summary, claims, recommendedActions } = parsed;

  const status = matchEnum(overallStatus, OVERALL_STATUSES);
  if (!status) return null;

  const summaryText = isString(summary) ? normalizeWhitespace(summary) : "";
  if (!summaryText) return null;

  if (!Array.isArray(claims)) return null;

  const seenIds = new Set<string>();
  const validatedClaims: Claim[] = [];
  for (let i = 0; i < claims.length && validatedClaims.length < MAX_CLAIMS; i++) {
    const claim = validateClaim(claims[i], i, sourceText);
    if (!claim) continue;
    if (seenIds.has(claim.id)) {
      claim.id = `claim-${validatedClaims.length + 1}`;
    }
    seenIds.add(claim.id);
    validatedClaims.push(claim);
  }

  if (validatedClaims.length === 0) return null;

  let actions: string[] = [];
  if (Array.isArray(recommendedActions)) {
    actions = recommendedActions
      .filter(isString)
      .map((a) => truncate(normalizeWhitespace(a), MAX_ACTION_LENGTH))
      .filter((a) => a.length > 0)
      .slice(0, 8);
  }

  // Guarantee the primary demo line "Do not make a payment..." exists when a
  // payment claim is present, without ever fabricating other content.
  const hasPaymentClaim = validatedClaims.some((c) => c.category === "PAYMENT");
  const hasPaymentAction = actions.some((a) => a.toLowerCase().includes("payment"));
  if (hasPaymentClaim && !hasPaymentAction) {
    actions.push("Do not make any payment until the opportunity is independently verified.");
  }

  return {
    overallStatus: deriveOverallStatus(validatedClaims, status),
    summary: truncate(summaryText, MAX_SUMMARY_LENGTH),
    claims: validatedClaims,
    recommendedActions: actions,
  };
}
