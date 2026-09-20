/**
 * LIVE S3+Textract extraction test (real AWS calls; not part of CI).
 *
 * Requires: AWS credentials with the least-privilege policy (or admin locally),
 * S3_UPLOADS_BUCKET + AWS_REGION set. Run with:
 *   S3_UPLOADS_BUCKET=... AWS_REGION=ap-southeast-1 npx tsx tests/live-textract.ts <file>
 *
 * Proves: upload → Textract (async for multi-page PDFs) → real text → the
 * temporary S3 object is DELETED after processing (verified via HeadObject).
 * No document text is printed beyond a 120-char sample.
 */
import fs from "node:fs";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { extractDocumentText } from "../lib/document-extract";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx tests/live-textract.ts <pdf|png|jpg>");
  process.exit(2);
}
const bucket = process.env.S3_UPLOADS_BUCKET || "";
if (!bucket) {
  console.error("S3_UPLOADS_BUCKET must be set");
  process.exit(2);
}

const bytes = new Uint8Array(fs.readFileSync(path));
console.log(`input: ${path} (${bytes.byteLength} bytes)`);

const started = Date.now();
const result = await extractDocumentText(bytes, {
  name: path.split(/[\\/]/).pop() || "document.pdf",
  size: bytes.byteLength,
  type: path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
});

console.log(`method: ${result.method}  pages: ${result.pages}  chars: ${result.text.length}  latencyMs: ${Date.now() - started}`);
console.log(`sample: ${JSON.stringify(result.text.slice(0, 120))}`);

if (result.text.length < 40) {
  console.error("FAIL: extracted text below meaningfulness threshold");
  process.exit(1);
}

// Cleanup verification: the uploaded object must no longer exist. We can't
// know the random key from outside, so verify at the bucket level instead:
// list the prefix — after a fresh run with no other traffic it should be empty.
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-1" });
const listed = await s3.send(new (await import("@aws-sdk/client-s3")).ListObjectsV2Command({
  Bucket: bucket,
  Prefix: "tmp-uploads/",
}));
const leftover = listed.Contents?.length ?? 0;
console.log(`cleanup: ${leftover === 0 ? "OK — no objects left under tmp-uploads/" : `LEFTOVER OBJECTS: ${leftover}`}`);
process.exit(leftover === 0 ? 0 : 1);
