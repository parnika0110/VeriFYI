/**
 * GET /api/verifications?limit=20 — recent verification history (optional
 * feature; the primary demo does not depend on it).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listVerifications } from "@/lib/verifications";
import { toClientError } from "@/lib/errors";
import { log } from "@/lib/logging";
import type { VerificationsListResponse } from "@/lib/contract";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam) ? limitParam : 20;

    const items = await listVerifications(limit);
    const body: VerificationsListResponse = { success: true, items };
    return NextResponse.json(body);
  } catch (error) {
    const { status, body } = toClientError(error);
    log.warn("verifications_list_failed", { status, error });
    const errorBody: VerificationsListResponse = { success: false, error: body.error };
    return NextResponse.json(errorBody, { status });
  }
}
