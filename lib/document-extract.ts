/**
 * Server-side document text extraction: S3 → Amazon Textract → text.
 *
 * Flow (used by POST /api/extract-document):
 *   1. Validate type/size (same rules as the UI: PNG/JPG/PDF, <= 10 MB).
 *   2. Upload bytes to a dedicated S3 prefix under a random key (no PII in
 *      the key; nothing is written to logs or DynamoDB).
 *   3. Images and 1-page PDFs use the synchronous DetectDocumentText call;
 *      multi-page PDFs use StartDocumentTextDetection + polling.
 *   4. Delete the S3 object after processing (best-effort), including on
 *      failure paths.
 *
 * Honesty rule: this module returns the document's actual text or throws a
 * controlled ExtractionError. It NEVER returns placeholder or fabricated
 * content — the caller (API route) maps failures to a clean 422.
 *
 * All AWS configuration comes from env (no secrets in code):
 *   AWS_REGION, S3_UPLOADS_BUCKET, optional TEXTRACT_S3_PREFIX,
 *   optional AWS credentials via the standard SDK chain (Amplify role).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  TextractClient,
  DetectDocumentTextCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  JobStatus,
} from "@aws-sdk/client-textract";
import { AppError } from "./errors";
import { log } from "./logging";
import { serverEnv } from "./server-env";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB (Textract sync limit)
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const ALLOWED_EXT = [".pdf", ".png", ".jpg", ".jpeg"];
const MIN_MEANINGFUL_CHARS = 40;
const ASYNC_POLL_INTERVAL_MS = 1200;
const ASYNC_TIMEOUT_MS = 55_000; // stay under the 60s function cap

export interface DocumentMeta {
  name: string;
  size: number;
  type: string;
}

/** Type+size validation using MIME when present and extension always. */
export function validateDocumentMeta(meta: DocumentMeta): void {
  const name = (meta.name || "").toLowerCase();
  const extOk = ALLOWED_EXT.some((ext) => name.endsWith(ext));
  const mimeOk = meta.type ? ALLOWED_MIME.has(meta.type) : false;
  if (!extOk && !mimeOk) {
    throw new AppError(
      "UNSUPPORTED_FILE_TYPE",
      "Unsupported file type. Please upload a PNG, JPG, or PDF.",
    );
  }
  if (meta.size <= 0) {
    throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  }
  if (meta.size > MAX_DOCUMENT_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      "File is too large. The maximum size is 10 MB.",
    );
  }
}

/** Meaningful-text gate: same bar as the client extractor. */
export function isMeaningfulDocumentText(text: string): boolean {
  if (text.length < MIN_MEANINGFUL_CHARS) return false;
  const alnum = text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "");
  return alnum.length >= MIN_MEANINGFUL_CHARS;
}

function s3(): S3Client {
  return new S3Client({ region: serverEnv("AWS_REGION") || "ap-southeast-1" });
}

function textract(): TextractClient {
  return new TextractClient({ region: serverEnv("AWS_REGION") || "ap-southeast-1" });
}

/** Test seams: inject fakes instead of hitting AWS. */
export interface DocumentExtractDeps {
  upload: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  extract: (key: string, body: Uint8Array) => Promise<{ text: string; pages: number | null; method: "textract-sync" | "textract-async" }>;
  remove: (key: string) => Promise<void>;
}

/** Production deps wired to the real AWS clients. */
function defaultDeps(): DocumentExtractDeps {
  const s3Client = s3();
  const tClient = textract();
  return {
    upload: async (key, body, contentType) => {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config().bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.byteLength,
        }),
      );
    },
    extract: async (key, body) => {
      if (key.endsWith(".pdf")) {
        const started = await tClient.send(
          new StartDocumentTextDetectionCommand({
            DocumentLocation: { S3Object: { Bucket: config().bucket, Name: key } },
          }),
        );
        const jobId = started.JobId;
        if (!jobId) {
          throw new AppError("ANALYSIS_FAILED", "Document processing could not be started. Please try again.");
        }
        const deadline = Date.now() + ASYNC_TIMEOUT_MS;
        for (;;) {
          if (Date.now() > deadline) {
            throw new AppError("UPSTREAM_TIMEOUT", "Document processing took too long. Please try again.");
          }
          await new Promise((r) => setTimeout(r, ASYNC_POLL_INTERVAL_MS));
          const status = await tClient.send(new GetDocumentTextDetectionCommand({ JobId: jobId }));
          if (status.JobStatus === JobStatus.FAILED) {
            throw new AppError("ANALYSIS_FAILED", "The document could not be processed. Please try a different file.");
          }
          if (status.JobStatus !== JobStatus.SUCCEEDED) continue;
          let text = cleanText(blocksToText(status.Blocks));
          const pages = status.DocumentMetadata?.Pages ?? null;
          while (status.NextToken) {
            const more = await tClient.send(
              new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: status.NextToken }),
            );
            text += "\n" + cleanText(blocksToText(more.Blocks));
            status.NextToken = more.NextToken;
          }
          return { text, pages, method: "textract-async" };
        }
      }
      const out = await tClient.send(new DetectDocumentTextCommand({ Document: { Bytes: body } }));
      return { text: cleanText(blocksToText(out.Blocks)), pages: out.DocumentMetadata?.Pages ?? null, method: "textract-sync" };
    },
    remove: async (key) => {
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key }));
      } catch (error) {
        log.warn("upload_delete_failed", { error });
      }
    },
  };
}

/** Overridable for tests. */
let depsOverride: DocumentExtractDeps | null = null;
export function setDocumentExtractDepsForTests(d: DocumentExtractDeps | null): void {
  depsOverride = d;
}

function config(): { bucket: string; prefix: string } {
  const bucket = serverEnv("S3_UPLOADS_BUCKET");
  const prefix = process.env.TEXTRACT_S3_PREFIX?.trim() || "tmp-uploads/";
  if (!bucket) {
    throw new AppError(
      "ANALYSIS_FAILED",
      "Document processing is not available right now.",
    );
  }
  return { bucket, prefix };
}

/** Random key: unguessable, no filename/PII, deterministic prefix for lifecycle rules. */
function randomKey(prefix: string, ext: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${id}${ext}`;
}

function extFor(name: string, mime: string): string {
  const lower = (name || "").toLowerCase();
  for (const ext of ALLOWED_EXT) {
    if (lower.endsWith(ext)) return ext;
  }
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  return ".jpg";
}

/** Flatten Textract Blocks into plain text with line breaks. */
function blocksToText(blocks: Array<{ BlockType?: string; Text?: string }> | undefined): string {
  if (!blocks) return "";
  let text = "";
  let currentBlock = "";
  for (const block of blocks) {
    if (block.BlockType !== "LINE" || !block.Text) continue;
    text += currentBlock + block.Text;
    currentBlock = "\n";
  }
  return text.trim();
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ExtractResult {
  text: string;
  pages: number | null;
  method: "textract-sync" | "textract-async";
}

/**
 * Upload to S3, run Textract, delete the object, and return the text.
 * Throws AppError with client-safe codes/messages on every failure path.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  meta: DocumentMeta,
): Promise<ExtractResult> {
  validateDocumentMeta(meta);
  const deps = depsOverride ?? defaultDeps();
  // When deps are injected (tests), no real bucket config is required.
  const prefix = depsOverride ? "tmp-uploads/" : config().prefix;
  const key = randomKey(prefix, extFor(meta.name, meta.type));

  try {
    await deps.upload(key, bytes, meta.type || "application/octet-stream");
    const { text, pages, method } = await deps.extract(key, bytes);
    if (!isMeaningfulDocumentText(text)) {
      throw new AppError(
        "NO_TEXT_EXTRACTED",
        "OCR couldn’t find readable text in this document. Try a clearer scan or paste the text.",
      );
    }
    return { text, pages, method };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("textract_failed", { error });
    throw new AppError(
      "ANALYSIS_FAILED",
      "Text extraction failed for this document. Please try again.",
    );
  } finally {
    // Always delete the temporary upload — success or failure.
    await deps.remove(key);
  }
}
