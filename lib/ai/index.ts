/**
 * AI provider selection.
 *
 * Resolution order:
 *   1. AI_PROVIDER=mock | gemini | bedrock (explicit)
 *   2. legacy MOCK_BEDROCK=1 -> mock (backward compatible)
 *   3. default: gemini (when GEMINI_API_KEY is present) — the active provider
 *      since the AWS account has an account-level Bedrock restriction
 *
 * The selected provider only produces raw JSON text; the anti-fabrication
 * validation layer (lib/validation.ts) remains authoritative for all of them.
 */

import { AppError } from "../errors";
import { log } from "../logging";
import { invokeGeminiText, isGeminiConfigured, DEFAULT_GEMINI_MODEL } from "./gemini";
import { invokeMockText, isMockProviderRequested } from "./mock";
import { getBedrockConfig, isBedrockConfigured, invokeBedrockText } from "./bedrock";
import type { AiInvoke, AiProviderName } from "./types";

export type { AiInvoke, AiInvokeResult, AiProviderName } from "./types";

export function getProviderName(): AiProviderName {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "bedrock") return "bedrock";
  if (explicit === "gemini") return "gemini";
  if (isMockProviderRequested()) return "mock"; // legacy MOCK_BEDROCK=1
  return "gemini"; // active default
}

export function getActiveModelId(): string {
  switch (getProviderName()) {
    case "mock":
      return "mock";
    case "bedrock":
      return getBedrockConfig().modelId;
    case "gemini":
    default:
      return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  }
}

/** True when the resolved provider is usable with the current environment. */
export function isProviderConfigured(): boolean {
  switch (getProviderName()) {
    case "mock":
      return true;
    case "bedrock":
      return isBedrockConfigured();
    case "gemini":
    default:
      return isGeminiConfigured();
  }
}

export function resolveProvider(): AiInvoke {
  switch (getProviderName()) {
    case "mock":
      log.info("ai_provider_selected", { provider: "mock" });
      return invokeMockText;
    case "bedrock":
      log.info("ai_provider_selected", { provider: "bedrock" });
      return invokeBedrockText;
    case "gemini":
    default:
      log.info("ai_provider_selected", { provider: "gemini" });
      return invokeGeminiText;
  }
}

/**
 * Fail fast when the resolved provider cannot run (e.g. GEMINI_API_KEY
 * missing). Produces a controlled, client-safe error.
 */
export function requireConfiguredProvider(): AiInvoke {
  if (!isProviderConfigured()) {
    const provider = getProviderName();
    log.warn("ai_provider_not_configured", { provider });
    throw new AppError(
      "ANALYSIS_FAILED",
      "The analysis service is not configured. Please try again later.",
    );
  }
  return resolveProvider();
}
