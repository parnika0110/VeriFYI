/**
 * POST /api/analyze
 *
 * Request:  { "text": "<offer/message/listing text>" }
 * Response: 200 { "success": true, "result": VerificationResult }
 *           400 invalid/empty body · 413 input too large · 5xx controlled errors
 *
 * Errors never expose stack traces, AWS details, or credentials.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { analyzeText } from "@/lib/analyzer";
import { getProviderName, isProviderConfigured } from "@/lib/ai";
import { saveVerification } from "@/lib/verifications";
import { MAX_INPUT_LENGTH } from "@/lib/validation";
import { AppError, toClientError } from "@/lib/errors";
import { hashInput, log } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let inputLength = 0;

  try {
    const body = await parseJsonBody(request);
    const text = extractTextInput(body);
    inputLength = text.length;

    log.info("analyze_request_received", { inputLength, inputHash: hashInput(text) });
    log.info("analysis_started", { inputLength, provider: getProviderName() });

    // Fail fast with a controlled error when the active provider is not
    // configured (e.g. GEMINI_API_KEY missing) — never a partial result and
    // never a silent mock fallback.
    if (!isProviderConfigured()) {
      log.warn("provider_not_configured", {
        provider: getProviderName(),
        providerConfigured: false,
      });
      throw new AppError(
        "ANALYSIS_FAILED",
        "The analysis service is not configured. Please try again later.",
      );
    }

    const { result, metadata } = await analyzeText(text);

    log.info("analysis_completed", {
      inputLength,
      inputHash: hashInput(text),
      overallStatus: result.overallStatus,
      claimCount: result.claims.length,
      latencyMs: metadata.latencyMs,
      totalLatencyMs: Date.now() - startedAt,
      attempts: metadata.attempts,
      provider: metadata.provider,
      modelId: metadata.modelId,
    });

    // Persistence is best-effort: a DynamoDB outage must never fail an analysis.
    void saveVerification(result).catch((error) =>
      log.warn("verification_persist_failed", { error }),
    );

    // Frontend (J Bob's lib/api.ts normalizer) reads the report at the TOP
    // level; `success`/`result` remain for the documented backend envelope,
    // so both shapes work simultaneously.
    return NextResponse.json({
      success: true,
      result,
      overallStatus: result.overallStatus,
      summary: result.summary,
      claims: result.claims.map((claim) => ({
        ...claim,
        // Frontend expects per-claim `actions: string[]`; keep
        // recommendedAction for the documented contract.
        actions: claim.recommendedAction ? [claim.recommendedAction] : [],
      })),
      recommendedActions: result.recommendedActions,
    });
  } catch (error) {
    const { status, body } = toClientError(error);
    log.warn("analyze_request_failed", {
      status,
      inputLength,
      error,
      totalLatencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(body, { status });
  }
}

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new AppError("INVALID_REQUEST", "Unable to read request body");
  }

  if (raw.length > MAX_INPUT_LENGTH + 2048) {
    throw new AppError("INPUT_TOO_LARGE", "Request body exceeds the size limit");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_REQUEST", "Request body is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError("INVALID_REQUEST", "Request body must be a JSON object");
  }
  return parsed;
}

function extractTextInput(body: unknown): string {
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") {
    throw new AppError("INVALID_REQUEST", "\"text\" must be a string");
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AppError("EMPTY_INPUT", "\"text\" must not be empty");
  }
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new AppError("INPUT_TOO_LARGE", "\"text\" exceeds the maximum input size");
  }
  return trimmed;
}
