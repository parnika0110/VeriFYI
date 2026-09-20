/**
 * VeriFYI shared data contract.
 *
 * This file is the single source of truth for the backend <-> frontend
 * interface. The frontend (J Bob) must be able to rely on every type in
 * here, so changes are breaking changes and must be communicated.
 *
 * Philosophy: CLAIM -> EVIDENCE -> STATUS -> EXPLANATION -> NEXT ACTION.
 * VeriFYI never labels something a "scam" from an arbitrary AI score;
 * every status must be traceable to concrete evidence (or the explicit
 * absence of evidence, which yields UNVERIFIED).
 */

/** Status of a single claim, based on available evidence. */
export type VerificationStatus =
  | "SUPPORTED"
  | "UNVERIFIED"
  | "CONTRADICTED";

/** Overall verdict for the analyzed text. */
export type OverallStatus =
  | "VERIFIED"
  | "NEEDS_VERIFICATION"
  | "HIGH_RISK";

/** Coarse bucket for a claim, used for UI grouping. */
export type ClaimCategory =
  | "COMPANY"
  | "ROLE"
  | "SALARY"
  | "RECRUITER"
  | "PAYMENT"
  | "CONTACT"
  | "DOMAIN"
  | "DEADLINE"
  | "OTHER";

/** What kind of backing evidence exists for a claim. */
export type EvidenceType = "USER_PROVIDED" | "OFFICIAL" | "SEARCH";

export interface Evidence {
  /** Where the evidence came from, e.g. "User-provided message". */
  source: string;
  type: EvidenceType;
  description: string;
  /** Exact excerpt from the input that backs this evidence, if any. */
  relevantText?: string;
}

export interface Claim {
  id: string;
  claim: string;
  category: ClaimCategory;
  status: VerificationStatus;
  /** 0..1 model confidence in the STATUS itself (not in the claim). */
  confidence: number;
  explanation: string;
  evidence: Evidence[];
  recommendedAction?: string;
}

export interface VerificationResult {
  overallStatus: OverallStatus;
  summary: string;
  claims: Claim[];
  recommendedActions: string[];
}

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

/** POST /api/analyze request body. */
export interface AnalyzeRequest {
  /** The offer/message/listing text to analyze. 1..MAX_INPUT_LENGTH chars. */
  text: string;
}

export interface AnalyzeSuccessResponse {
  success: true;
  result: VerificationResult;
}

export interface AnalyzeErrorResponse {
  success: false;
  error: string;
}

export type AnalyzeResponse =
  | AnalyzeSuccessResponse
  | AnalyzeErrorResponse;

/** GET /api/health response (deployment/monitoring probe). */
export interface HealthResponse {
  ok: boolean;
  service: string;
  time: string;
  /** Which AI/infra features are configured in this environment. */
  bedrockConfigured: boolean;
  dynamodbConfigured: boolean;
  /** Active AI provider ("gemini" | "bedrock" | "mock"). Additive field. */
  provider?: "gemini" | "bedrock" | "mock";
  /** True when the active provider can actually run (e.g. key present). Additive field. */
  providerConfigured?: boolean;
  /** Safe delivery diagnostics: whether the env VAR NAMES were seen at runtime (never values). */
  aiProviderEnvPresent?: boolean;
  geminiModelEnvPresent?: boolean;
  geminiKeyEnvPresent?: boolean;
}

/** Envelope for GET /api/verifications (history; optional feature). */
export interface VerificationsListResponse {
  success: boolean;
  items?: StoredVerification[];
  error?: string;
}

/** One row of verification history as stored in DynamoDB. */
export interface StoredVerification {
  id: string;
  createdAt: string;
  overallStatus: OverallStatus;
  summary: string;
  claimCount: number;
  result: VerificationResult;
}
