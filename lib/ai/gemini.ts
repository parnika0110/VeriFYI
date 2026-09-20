/**
 * Google Gemini provider (server-side only — the API key must never reach
 * the client/browser).
 *
 * Uses the official @google/genai SDK. Output is raw model text expected to
 * contain a single JSON object; parsing/validation happen downstream in
 * lib/analyzer.ts + lib/validation.ts. Gemini is NOT trusted to enforce
 * security — the validator remains authoritative.
 */

import { GoogleGenAI } from "@google/genai";
import { AppError } from "../errors";
import { log } from "../logging";
import { serverEnv } from "../server-env";
import type { AiInvokeResult } from "./types";

/**
 * Default model. Pinned to a stable ID after live verification against the
 * full anti-fabrication suite. History: gemini-flash-latest resolved to an
 * overloaded model (503); gemini-2.5-flash worked but its free-tier daily
 * bucket (20 req/day, per model) exhausted during demo verification and
 * gemini-2.5-flash-lite was retired for new users; gemini-3.1-flash-lite
 * verified passing both production samples with strict verbatim quoting.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/** Reads GEMINI_API_KEY / GEMINI_MODEL via the server-only env accessor
 *  (runtime env first, then build-time captured values). Never logs values. */
export function getGeminiConfig(): GeminiConfig | null {
  const apiKey = serverEnv("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = serverEnv("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  return { apiKey, model };
}

/** True when Gemini is usable in this environment (for /api/health). */
export function isGeminiConfigured(): boolean {
  return getGeminiConfig() !== null;
}

let cachedClient: GoogleGenAI | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/** For tests: reset the cached client so env changes take effect. */
export function resetGeminiClientForTests(): void {
  cachedClient = null;
}

/**
 * Invoke Gemini with a user prompt and optional system instruction.
 * Forces JSON output via responseMimeType; temperature 0 for stable
 * classification/extraction. Errors are mapped to safe AppErrors.
 */
export async function invokeGeminiText(
  prompt: string,
  system?: string,
): Promise<AiInvokeResult> {
  const config = getGeminiConfig();
  if (!config) {
    throw new AppError("ANALYSIS_FAILED", "AI provider is not configured");
  }

  const startedAt = Date.now();
  try {
    const response = await getClient(config.apiKey).models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        ...(system ? { systemInstruction: system } : {}),
        // Guarantee machine-readable output (no prose, no markdown fences).
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 8192,
      },
    });

    const latencyMs = Date.now() - startedAt;
    const text = response.text ?? "";

    log.info("gemini_response", {
      model: config.model,
      latencyMs,
      outputChars: text.length,
      finishReason: response.candidates?.[0]?.finishReason,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });

    return {
      text,
      modelId: `gemini:${config.model}`,
      latencyMs,
      stopReason: response.candidates?.[0]?.finishReason,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Map SDK/API failures to controlled errors. Never include the API key,
    // request URL, or raw provider payload in client-facing messages; full
    // details go to server-side logs only.
    log.warn("gemini_invoke_failed", {
      model: config.model,
      error,
    });
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|aborted|deadline/i.test(message);
    // Retry once on transient upstream overload (e.g. HTTP 503 UNAVAILABLE).
    // Only when nothing was sent that could double-bill; generation is safe to retry.
    const transient = /503|unavailable|overloaded|high demand/i.test(message);
    if (transient && !timedOut) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        const retry = await getClient(config.apiKey).models.generateContent({
          model: config.model,
          contents: prompt,
          config: {
            ...(system ? { systemInstruction: system } : {}),
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 8192,
          },
        });
        const retryLatency = Date.now() - startedAt;
        const retryText = retry.text ?? "";
        log.info("gemini_response", {
          model: config.model,
          latencyMs: retryLatency,
          retriedOnce: true,
          outputChars: retryText.length,
          finishReason: retry.candidates?.[0]?.finishReason,
          inputTokens: retry.usageMetadata?.promptTokenCount,
          outputTokens: retry.usageMetadata?.candidatesTokenCount,
        });
        return {
          text: retryText,
          modelId: `gemini:${config.model}`,
          latencyMs: retryLatency,
          stopReason: retry.candidates?.[0]?.finishReason,
          inputTokens: retry.usageMetadata?.promptTokenCount,
          outputTokens: retry.usageMetadata?.candidatesTokenCount,
        };
      } catch (retryError) {
        error = retryError as Error;
      }
    }
    throw new AppError(
      timedOut ? "UPSTREAM_TIMEOUT" : "ANALYSIS_FAILED",
      timedOut
        ? "The analysis took too long. Please try again with a shorter text."
        : "The analysis could not be completed at this time. Please try again.",
      { cause: error },
    );
  }
}
