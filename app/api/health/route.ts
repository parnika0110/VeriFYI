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
  };
  return NextResponse.json(body);
}
