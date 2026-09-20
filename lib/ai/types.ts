/**
 * Provider-agnostic AI invocation interface.
 *
 * The analyzer (lib/analyzer.ts) depends only on this seam — never on a
 * concrete SDK — so providers (gemini / bedrock / mock) are interchangeable
 * without touching prompt, parsing, or validation logic. Validation
 * (lib/validation.ts) remains authoritative regardless of provider.
 */

export interface AiInvokeResult {
  /** Raw model text output (expected to contain a single JSON object). */
  text: string;
  /** Model/provider identifier for logging and audit. Never shown to clients. */
  modelId: string;
  latencyMs: number;
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type AiProviderName = "gemini" | "bedrock" | "mock";

export type AiInvoke = (prompt: string, system?: string) => Promise<AiInvokeResult>;
