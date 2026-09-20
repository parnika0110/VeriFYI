import { getMockReport, MOCK_LATENCY_MS } from "./mock-data";
import { isRecord, isString } from "./api-utils";
import { VerifyiError } from "./types";
import type {
  AnalysisReport,
  AnalyzeRequest,
  Claim,
  ClaimCategory,
  ClaimStatus,
  EvidenceItem,
  EvidenceSource,
  OverallStatus,
} from "./types";

/**
 * VeriFYI API layer — the ONLY place the app talks to the analysis backend.
 * Components never call fetch() directly.
 *
 * Modes (env vars, see .env.example):
 *  - MOCK mode   (NEXT_PUBLIC_USE_MOCK=true): realistic local responses so
 *    development and the demo never block on backend readiness.
 *  - REAL mode   (NEXT_PUBLIC_USE_MOCK=false): POST { text } to
 *    `${NEXT_PUBLIC_API_URL}/api/analyze` and normalize the response.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const USE_MOCK = (process.env.NEXT_PUBLIC_USE_MOCK ?? "true") !== "false";

const CLAIM_STATUSES: ClaimStatus[] = ["SUPPORTED", "UNVERIFIED", "CONTRADICTED"];
const OVERALL_STATUSES: OverallStatus[] = [
  "ALL_SUPPORTED",
  "PARTIALLY_VERIFIED",
  "NEEDS_VERIFICATION",
  "HIGH_RISK",
  "NO_CLAIMS",
];
const EVIDENCE_ORIGINS: EvidenceSource[] = ["USER_INPUT", "WEB", "DOCUMENT", "AI_EXPLANATION"];
// NOTE: keep in sync with ClaimCategory in lib/types.ts.
const CATEGORIES: ClaimCategory[] = [
  "RECRUITER",
  "COMPANY",
  "COMPENSATION",
  "PAYMENT",
  "CONTACT",
  "SCHOLARSHIP",
  "COURSE",
  "URGENCY",
  "OTHER",
];

export async function analyzeClaim(
  request: AnalyzeRequest,
): Promise<AnalysisReport> {
  const text = request.text.trim();
  if (!text) {
    throw new VerifyiError("empty-input", "There is no text to analyze.");
  }

  if (USE_MOCK) return analyzeMock(text);
  return analyzeReal(text);
}

/* ------------------------------- Mock mode ------------------------------- */

async function analyzeMock(text: string): Promise<AnalysisReport> {
  const { min, max } = MOCK_LATENCY_MS;
  const latency = min + Math.random() * (max - min);
  await new Promise((resolve) => setTimeout(resolve, latency));
  return getMockReport(text);
}

/* ------------------------------- Real mode ------------------------------- */

const REQUEST_TIMEOUT_MS = 45_000;

async function analyzeReal(text: string): Promise<AnalysisReport> {
  // Same-origin by default: an empty NEXT_PUBLIC_API_URL means this app's own
  // /api/analyze (relative fetch). No CORS involved in the integrated setup.
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text } satisfies AnalyzeRequest),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new VerifyiError(
        "network",
        "The analysis is taking too long. Please try again.",
      );
    }
    throw new VerifyiError(
      "network",
      "VeriFYI couldn’t reach the analysis service. Please check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new VerifyiError(
      "api",
      response.status === 429
        ? "VeriFYI is receiving a lot of requests right now. Please wait a moment and try again."
        : "VeriFYI couldn’t complete the analysis. Please try again in a moment.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new VerifyiError(
      "invalid-response",
      "The analysis service returned an unexpected response. Please try again.",
    );
  }

  return normalizeReport(payload);
}

/* --------------------------- Response handling --------------------------- */

/**
 * Validates and normalizes a raw backend payload into AnalysisReport.
 * The backend may drift (missing fields, wrong casing, string numbers);
 * normalization keeps the UI rendering well-formed data or throwing a
 * clean, user-facing error — never rendering garbage, never crashing.
 */
function normalizeReport(payload: unknown): AnalysisReport {
  if (!isRecord(payload)) {
    throw new VerifyiError(
      "invalid-response",
      "The analysis service returned an unexpected response. Please try again.",
    );
  }

  // Backend may wrap the report in `{ success, result }` — unwrap it when
  // present so both envelope styles normalize identically.
  const report = isRecord(payload.result) ? payload.result : payload;

  const claimsRaw = Array.isArray(report.claims) ? report.claims : [];
  if (claimsRaw.length === 0) {
    throw new VerifyiError(
      "invalid-response",
      "The analysis completed but contained no checkable claims. Please try rephrasing your input.",
    );
  }

  const claims = claimsRaw.map(normalizeClaim).filter((c): c is Claim => c !== null);

  if (claims.length === 0) {
    throw new VerifyiError(
    "invalid-response",
    "The analysis completed but contained no checkable claims. Please try rephrasing your input.",
  );
  }

  const counts = { SUPPORTED: 0, UNVERIFIED: 0, CONTRADICTED: 0 } as Record<ClaimStatus, number>;
  for (const claim of claims) counts[claim.status] += 1;

  const overallStatus = deriveOverallStatus(report.overallStatus, counts, claims.length);

  const summary = isString(report.summary) && report.summary.trim()
    ? report.summary.trim()
    : defaultSummary(counts, claims.length);

  return { overallStatus, summary, claims };
}

function normalizeClaim(raw: unknown, index: number): Claim | null {
  if (!isRecord(raw)) return null;
  const claimText = isString(raw.claim) ? raw.claim.trim() : "";
  if (!claimText) return null;

  const status = CLAIM_STATUSES.includes(raw.status as ClaimStatus)
    ? (raw.status as ClaimStatus)
    : "UNVERIFIED";
  const category = CATEGORIES.includes(raw.category as ClaimCategory)
    ? (raw.category as ClaimCategory)
    : "OTHER";

  const confidenceRaw = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? clamp01(confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw) : 0.5;

  const explanation = isString(raw.explanation) && raw.explanation.trim()
    ? raw.explanation.trim()
    : "The analysis did not include an explanation for this claim.";

  const actions = Array.isArray(raw.actions)
    ? raw.actions.filter(isString).map((a) => a.trim()).filter(Boolean)
    : isString(raw.recommendedAction) && raw.recommendedAction.trim()
      ? [raw.recommendedAction.trim()]
      : [];

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(normalizeEvidence).filter((e): e is EvidenceItem => e !== null)
    : [];

  const id = isString(raw.id) && raw.id.trim() ? raw.id.trim() : String(index + 1);

  return { id, claim: claimText, category, status, confidence, explanation, actions, evidence };
}

function normalizeEvidence(raw: unknown): EvidenceItem | null {
  if (!isRecord(raw)) return null;
  // Backend contract uses `relevantText` for the quoted passage; accept the
  // documented `excerpt` spelling too. No quote -> nothing to show honestly.
  const excerpt = isString(raw.excerpt)
    ? raw.excerpt.trim()
    : isString(raw.relevantText)
      ? raw.relevantText.trim()
      : "";
  if (!excerpt) return null;

  // Map the backend evidence `type` onto the UI `origin` vocabulary.
  // USER_PROVIDED quotes come from the user's own text; OFFICIAL/SEARCH are
  // only ever attached by a real retrieval subsystem, never by the model.
  let origin: EvidenceSource;
  if (isString(raw.origin) && EVIDENCE_ORIGINS.includes(raw.origin as EvidenceSource)) {
    origin = raw.origin as EvidenceSource;
  } else {
    switch (raw.type) {
      case "USER_PROVIDED":
        origin = "USER_INPUT";
        break;
      case "OFFICIAL":
      case "SEARCH":
        origin = "WEB";
        break;
      default:
        origin = "AI_EXPLANATION";
    }
  }

  // Stance: derive from the claim status unless explicitly provided.
  const stance =
    raw.stance === "SUPPORTS" || raw.stance === "CONTRADICTS" || raw.stance === "NEUTRAL"
      ? raw.stance
      : undefined;

  const item: EvidenceItem = {
    source: isString(raw.source) && raw.source.trim() ? raw.source.trim() : "Source",
    url: isString(raw.url) && raw.url.trim() ? raw.url.trim() : undefined,
    excerpt,
    stance: stance ?? "NEUTRAL",
    origin,
  };
  return item;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function deriveOverallStatus(
  raw: unknown,
  counts: Record<ClaimStatus, number>,
  total: number,
): OverallStatus {
  if (typeof raw === "string") {
    const match = OVERALL_STATUSES.find((s) => s === raw.toUpperCase());
    if (match) return match;
  }
  // Backend didn't send a usable overallStatus — derive it honestly.
  if (total === 0) return "NO_CLAIMS";
  if (counts.CONTRADICTED > 0) return "HIGH_RISK";
  if (counts.UNVERIFIED === 0) return "ALL_SUPPORTED";
  if (counts.SUPPORTED > 0) return "PARTIALLY_VERIFIED";
  return "NEEDS_VERIFICATION";
}

function defaultSummary(counts: Record<ClaimStatus, number>, total: number): string {
  if (total === 0) return "No checkable claims were found.";
  const parts = [
    `${counts.SUPPORTED} supported`,
    `${counts.UNVERIFIED} unverified`,
    `${counts.CONTRADICTED} contradicted`,
  ];
  return `Out of ${total} claim${total === 1 ? "" : "s"} analyzed: ${parts.join(", ")}.`;
}
