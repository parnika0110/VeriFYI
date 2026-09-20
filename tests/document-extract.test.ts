/**
 * Document upload/extraction tests (offline, fully hermetic).
 *
 * The AWS layer (S3 + Textract) is injected via setDocumentExtractDepsForTests,
 * so these tests prove the pipeline logic — validation, key handling,
 * meaningful-text gating, cleanup guarantees, error mapping — without any
 * network calls. Live Textract behavior is verified in the deployed
 * environment where the bucket/role exist.
 *
 * Covers:
 *  1. paste-text flow regression (existing analyzeClaim still used for text)
 *  2. PDF/image metadata validation (type, size, empty)
 *  3. successful extraction (async PDF path) with S3 delete afterwards
 *  4. extraction failure still deletes the temp S3 object
 *  5. no-meaningful-text rejection (never fabricates placeholder text)
 *  6. unsupported file type rejection
 *  7. random, non-PII object keys under the fixed prefix
 *  8. anti-fabrication evidence validation on extracted text
 *  9. extraction/analysis logging contains no raw document contents
 */

import assert from "node:assert/strict";
import {
  extractDocumentText,
  validateDocumentMeta,
  isMeaningfulDocumentText,
  setDocumentExtractDepsForTests,
  type DocumentExtractDeps,
} from "../lib/document-extract";
import { AppError } from "../lib/errors";
import { validateVerificationResult } from "../lib/validation";
import { log } from "../lib/logging";

let passed = 0;
let failed = 0;
const results: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      results.push(`PASS: ${name}`);
    })
    .catch((error: unknown) => {
      failed++;
      results.push(`FAIL: ${name} — ${error instanceof Error ? error.message : String(error)}`);
    });
}

const OFFER_TEXT =
  "QSpiders Software Training Offer Letter. Dear Candidate, you have been selected for the " +
  "Java Full Stack Developer training program. A security deposit of Rs 25,000 is required " +
  "before training begins. Contact hr@qspiders-gmail.com for payment details.";

function fakeDeps(overrides: Partial<DocumentExtractDeps> = {}): DocumentExtractDeps & {
  uploadedKeys: string[];
  deletedKeys: string[];
} {
  const uploadedKeys: string[] = [];
  const deletedKeys: string[] = [];
  return {
    uploadedKeys,
    deletedKeys,
    upload: async (key) => {
      uploadedKeys.push(key);
    },
    extract: async () => ({ text: OFFER_TEXT, pages: 2, method: "textract-async" }),
    remove: async (key) => {
      deletedKeys.push(key);
    },
    ...overrides,
  };
}

async function main(): Promise<void> {
  // 1. Paste-text flow regression: text analysis path unchanged.
  await check("paste-text pipeline unchanged: analyzeClaim still works", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = "true";
    const { analyzeClaim } = await import("../lib/api");
    const report = await analyzeClaim({ text: "You have been selected for an internship. Pay Rs 999 registration fee." });
    assert.ok(report.claims.length > 0);
    delete process.env.NEXT_PUBLIC_USE_MOCK;
  });

  // 2. Metadata validation.
  await check("rejects unsupported file type (MIME + extension)", () => {
    assert.throws(
      () => validateDocumentMeta({ name: "notes.txt", size: 100, type: "text/plain" }),
      (e: unknown) => e instanceof AppError && e.code === "UNSUPPORTED_FILE_TYPE",
    );
  });
  await check("rejects empty file", () => {
    assert.throws(
      () => validateDocumentMeta({ name: "scan.pdf", size: 0, type: "application/pdf" }),
      (e: unknown) => e instanceof AppError && e.code === "EMPTY_FILE",
    );
  });
  await check("rejects oversized file (>10MB)", () => {
    assert.throws(
      () => validateDocumentMeta({ name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" }),
      (e: unknown) => e instanceof AppError && e.code === "FILE_TOO_LARGE",
    );
  });
  await check("accepts valid PDF/image metadata", () => {
    validateDocumentMeta({ name: "offer.pdf", size: 1024, type: "application/pdf" });
    validateDocumentMeta({ name: "photo.jpeg", size: 2048, type: "" }); // empty MIME falls back to ext
  });

  // 3. Successful extraction end-to-end with cleanup.
  await check("successful PDF extraction: text returned, temp object deleted", async () => {
    const deps = fakeDeps();
    setDocumentExtractDepsForTests(deps);
    const out = await extractDocumentText(new Uint8Array([1, 2, 3]), {
      name: "qspiders-offer.pdf",
      size: 3,
      type: "application/pdf",
    });
    assert.equal(out.text, OFFER_TEXT);
    assert.equal(out.pages, 2);
    assert.equal(out.method, "textract-async");
    assert.equal(deps.uploadedKeys.length, 1);
    assert.deepEqual(deps.deletedKeys, deps.uploadedKeys); // cleanup guaranteed
    setDocumentExtractDepsForTests(null);
  });

  // 4. Failure still cleans up.
  await check("extraction failure still deletes the temp S3 object", async () => {
    const deps = fakeDeps({
      extract: async () => {
        throw new Error("simulated textract outage");
      },
    });
    setDocumentExtractDepsForTests(deps);
    await assert.rejects(
      () => extractDocumentText(new Uint8Array([1]), { name: "x.pdf", size: 1, type: "application/pdf" }),
      (e: unknown) => e instanceof AppError && e.code === "ANALYSIS_FAILED",
    );
    assert.equal(deps.deletedKeys.length, 1, "must delete even on failure");
    setDocumentExtractDepsForTests(null);
  });

  // 5. Meaningful-text gate.
  await check("OCR garbage/empty result -> NO_TEXT_EXTRACTED (no fabrication)", async () => {
    const deps = fakeDeps({ extract: async () => ({ text: "~~ ~~ ~~", pages: 1, method: "textract-sync" }) });
    setDocumentExtractDepsForTests(deps);
    await assert.rejects(
      () => extractDocumentText(new Uint8Array([1]), { name: "scan.png", size: 1, type: "image/png" }),
      (e: unknown) => e instanceof AppError && e.code === "NO_TEXT_EXTRACTED",
    );
    setDocumentExtractDepsForTests(null);
  });
  await check("meaningful gate: short text fails, real sentence passes", () => {
    assert.equal(isMeaningfulDocumentText("hi"), false);
    assert.equal(isMeaningfulDocumentText("~~~ ~~~ !!! !!! ### ### $$$ $$$ %%% %%%"), false);
    assert.equal(isMeaningfulDocumentText(OFFER_TEXT), true);
  });

  // 6. Unsupported type through the full call.
  await check("unsupported type rejected before any upload happens", async () => {
    const deps = fakeDeps();
    setDocumentExtractDepsForTests(deps);
    await assert.rejects(
      () => extractDocumentText(new Uint8Array([1]), { name: "virus.exe", size: 1, type: "application/octet-stream" }),
      (e: unknown) => e instanceof AppError && e.code === "UNSUPPORTED_FILE_TYPE",
    );
    assert.equal(deps.uploadedKeys.length, 0, "nothing uploaded for invalid types");
    setDocumentExtractDepsForTests(null);
  });

  // 7. Random, non-PII keys under the fixed prefix.
  await check("object keys are random hex under tmp-uploads/ (no filename, no PII)", async () => {
    const deps = fakeDeps();
    setDocumentExtractDepsForTests(deps);
    await extractDocumentText(new Uint8Array([1]), { name: "Aadhaar_Priya_Sharma.pdf", size: 1, type: "application/pdf" });
    const key = deps.uploadedKeys[0];
    assert.ok(key.startsWith("tmp-uploads/"), `prefix: ${key}`);
    assert.ok(!key.includes("Aadhaar"), "original filename must NOT appear in the key");
    assert.match(key, /^tmp-uploads\/[0-9a-f]{32}\.pdf$/);
    setDocumentExtractDepsForTests(null);
  });

  // 8. Anti-fabrication validation runs on extracted text as the source.
  await check("validator traces evidence to extracted text (and rejects invented quotes)", () => {
    const base = {
      id: "claim-1",
      claim: "A security deposit of Rs 25,000 is required before training begins.",
      category: "PAYMENT" as const,
      status: "SUPPORTED" as const,
      confidence: 0.95,
      explanation: "The document states a deposit is required.",
    };
    const good = validateVerificationResult(
      {
        overallStatus: "HIGH_RISK",
        summary: "Payment requested in the document.",
        claims: [
          {
            ...base,
            evidence: [
              {
                source: "Uploaded document",
                type: "USER_PROVIDED" as const,
                description: "Deposit requirement stated in the offer letter.",
                relevantText: "a security deposit of Rs 25,000 is required before training begins",
              },
            ],
          },
        ],
        recommendedActions: ["Do not pay before verification."],
      },
      OFFER_TEXT,
    );
    assert.ok(good, "valid result should pass validation");
    assert.equal(good.overallStatus, "HIGH_RISK");

    // Fabricated quote (not in the extracted text) must be stripped -> UNVERIFIED.
    const bad = validateVerificationResult(
      {
        overallStatus: "HIGH_RISK",
        summary: "Payment requested.",
        claims: [
          {
            ...base,
            evidence: [
              {
                source: "Uploaded document",
                type: "USER_PROVIDED" as const,
                description: "Fabricated.",
                relevantText: "visit https://fake-verification.example.com to confirm",
              },
            ],
          },
        ],
        recommendedActions: [],
      },
      OFFER_TEXT,
    );
    assert.ok(bad, "shape should pass schema validation");
    const claim = bad.claims[0];
    assert.equal(claim.status, "UNVERIFIED", "untraceable evidence must downgrade the claim");
    assert.equal(claim.evidence.length, 0, "fabricated evidence must be stripped");
  });

  // 9. Logging privacy: no document text in log output.
  await check("logs contain no raw document contents", async () => {
    const emitted: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      emitted.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    };
    try {
      const deps = fakeDeps({
        extract: async () => {
          log.info("document_extract_completed", { chars: OFFER_TEXT.length, pages: 2 });
          return { text: OFFER_TEXT, pages: 2, method: "textract-async" };
        },
      });
      setDocumentExtractDepsForTests(deps);
      await extractDocumentText(new Uint8Array([1]), { name: "q.pdf", size: 1, type: "application/pdf" });
      setDocumentExtractDepsForTests(null);
    } finally {
      console.log = original;
    }
    const all = emitted.join("\n");
    assert.ok(!all.includes("QSpiders"), "log must not contain document text");
    assert.ok(!all.includes("hr@qspiders"), "log must not contain extracted PII");
  });

  console.log(results.join("\n"));
  console.log(`\nRESULT: ${passed}/${passed + failed} document-extraction tests passed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

void main().catch((error) => {
  console.error("test runner crashed:", error);
  process.exitCode = 1;
});
