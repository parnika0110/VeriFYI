/**
 * VeriFYI — shared domain types.
 *
 * These types are the contract between the frontend and the analysis API
 * (POST /api/analyze, provided by the backend teammate). If the backend
 * response drifts, `lib/api.ts` normalizes it into these types so the UI
 * only ever renders well-formed data.
 */

/** The three verification outcomes. Absence of evidence is NOT fraud. */
export type ClaimStatus = "SUPPORTED" | "UNVERIFIED" | "CONTRADICTED";

/** Overall verdict for a full analysis. */
export type OverallStatus =
  | "ALL_SUPPORTED"
  | "PARTIALLY_VERIFIED"
  | "NEEDS_VERIFICATION"
  | "HIGH_RISK"
  | "NO_CLAIMS";

/** High-level claim categories the analyzer extracts. */
export type ClaimCategory =
  | "RECRUITER"
  | "COMPANY"
  | "COMPENSATION"
  | "PAYMENT"
  | "CONTACT"
  | "SCHOLARSHIP"
  | "COURSE"
  | "URGENCY"
  | "OTHER";

/** Where a piece of evidence came from. The UI styles these differently —
 *  user-provided text must never be presented as external verification. */
export type EvidenceSource = "USER_INPUT" | "WEB" | "DOCUMENT" | "AI_EXPLANATION";

export interface EvidenceItem {
  /** Human-readable label, e.g. "Message text" or "google.com/careers". */
  source: string;
  /** Canonical link, only when one truly exists. Never invented. */
  url?: string;
  /** The quoted passage or snippet the finding rests on. */
  excerpt: string;
  /** Does this artifact support or contradict the claim? */
  stance: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
  /** Where the artifact came from (user text vs. external web). */
  origin: EvidenceSource;
}

export interface Claim {
  id: string;
  /** The atomic assertion being checked, e.g. "The recruiter represents the company". */
  claim: string;
  category: ClaimCategory;
  status: ClaimStatus;
  /** 0–1 model confidence in the assigned status. */
  confidence: number;
  /** Why this status was assigned — clearly an AI explanation, never evidence. */
  explanation: string;
  /** Concrete next steps for this specific claim. */
  actions: string[];
  /** May be empty — "No evidence found" is an important, honest result. */
  evidence: EvidenceItem[];
}

export interface AnalysisReport {
  overallStatus: OverallStatus;
  summary: string;
  claims: Claim[];
}

export interface AnalyzeRequest {
  text: string;
}

export type AppPhase = "input" | "analyzing" | "report";

/** A normalized error the UI can render without exposing stack traces. */
export class VerifyiError extends Error {
  readonly kind: "network" | "api" | "invalid-response" | "empty-input" | "file" | "unknown";

  constructor(kind: VerifyiError["kind"], message: string) {
    super(message);
    this.name = "VerifyiError";
    this.kind = kind;
  }
}
