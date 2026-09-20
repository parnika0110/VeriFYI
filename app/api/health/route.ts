/**
 * GET /api/health — liveness + configuration probe (no secrets returned).
 */

import { NextResponse } from "next/server";
import { getProviderName, isProviderConfigured } from "@/lib/ai";
import { isDynamoDbConfigured } from "@/lib/verifications";
import type { HealthResponse } from "@/lib/contract";

export const runtime = "nodejs";

export function GET() {
  const body: HealthResponse = {
    ok: true,
    service: "verifyi-backend",
    time: new Date().toISOString(),
    bedrockConfigured: isProviderConfigured(),
    dynamodbConfigured: isDynamoDbConfigured(),
    provider: getProviderName(),
    providerConfigured: isProviderConfigured(),
    // Safe runtime diagnostics: presence of the env VAR NAMES only — never values.
    aiProviderEnvPresent: Boolean(process.env.AI_PROVIDER),
    geminiModelEnvPresent: Boolean(process.env.GEMINI_MODEL),
    geminiKeyEnvPresent: Boolean(process.env.GEMINI_API_KEY),
  };
  return NextResponse.json(body);
}
