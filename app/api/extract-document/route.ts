/**
 * POST /api/extract-document
 *
 * Accepts a PDF/PNG/JPG, extracts the document's real text via
 * S3 + Amazon Textract, and returns it. The text is then submitted by the
 * client to the EXISTING /api/analyze pipeline — no contract changes.
 *
 * Request:  multipart/form-data with a single "file" field
 * Response: 200 { "success": true, "text": "...", "pages": 2, "method": "textract-async" }
 * Errors:   400 unsupported/empty · 413 too large · 422 no meaningful text ·
 *           503 when document processing is unavailable
 *
 * The upload is stored temporarily in S3 under a random key and deleted
 * immediately after processing (success or failure). Nothing about the
 * document contents is logged or persisted.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "@/lib/document-extract";
import { AppError, toClientError } from "@/lib/errors";
import { log } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

const FIELD = "file";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError("INVALID_REQUEST", "Expected a multipart file upload.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("INVALID_REQUEST", "Could not read the uploaded file.");
    }

    const file = form.get(FIELD);
    if (!(file instanceof File)) {
      throw new AppError("INVALID_REQUEST", "Missing file field.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_DOCUMENT_BYTES + 1024) {
      throw new AppError("FILE_TOO_LARGE", "File is too large. The maximum size is 6 MB.");
    }

    log.info("document_extract_started", {
      size: bytes.byteLength,
      contentType: file.type || "unknown",
    });

    const result = await extractDocumentText(bytes, {
      name: file.name,
      size: bytes.byteLength,
      type: file.type,
    });

    log.info("document_extract_completed", {
      size: bytes.byteLength,
      chars: result.text.length,
      pages: result.pages,
      method: result.method,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      pages: result.pages,
      method: result.method,
    });
  } catch (error) {
    const { status, body } = toClientError(error);
    log.warn("document_extract_failed", { status, error, latencyMs: Date.now() - startedAt });
    return NextResponse.json(body, { status });
  }
}
