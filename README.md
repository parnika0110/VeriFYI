# VeriFYI — Verify what matters

Evidence-based verification assistant for internship offers, job messages, recruiter DMs,
and online listings. **Bharat Builds by AWS × WeMakeDevs hackathon project.**

**Live:** <https://main.d1o8jaoxaet2sg.amplifyapp.com/> · one Next.js app serves both the UI and the API.

## Problem

People receive offers and messages that mix real facts with fabrication. Tools that output
a "scam score" give no way to challenge the verdict — and the same score would brand both
a sloppy real listing and an elaborate fake.

## Solution

VeriFYI never calls anything a "scam". It follows one pipeline:

> **CLAIM → EVIDENCE → STATUS → EXPLANATION → NEXT ACTION**

1. **CLAIM** — extract the specific factual claims from the submitted text
   (company, role, salary, recruiter identity, payment requirement, contact, domain, deadline, …).
2. **EVIDENCE** — attach only evidence that actually exists: `USER_PROVIDED` (a verbatim quote
   from the submitted text), `OFFICIAL`/`SEARCH` (only when real external evidence is supplied),
   or none at all.
3. **STATUS** — evaluate each claim:
   - `SUPPORTED` — available evidence backs it
   - `UNVERIFIED` — not enough evidence to confirm *(the correct default for real-world claims)*
   - `CONTRADICTED` — available evidence conflicts with it
4. **EXPLANATION** — each status is justified using only the available evidence.
5. **NEXT ACTION** — what the user can concretely do (check the official careers page, don't pay
   before verification, …).

## Architecture (current)

```text
                        Browser (React 19 UI: paste text or upload file)
                                        │
                  AWS Amplify Hosting — Next.js 16 SSR + API routes
                                        │
              ┌─────────────────────────┴──────────────────────────┐
              ▼                                                    ▼
   POST /api/analyze                                   POST /api/extract-document
              │                                                    │
              ▼                                                    ▼
   Google Gemini (AI provider)                          Amazon S3 (temporary upload,
              │                                          random key, deleted after use)
              ▼                                                    │
   lib/validation.ts — anti-fabrication gate                       ▼
   (strips invented quotes/sources,                       Amazon Textract (OCR:
   downgrades evidence-less claims)                        sync for images/1-page PDFs,
              │                                            async job for multi-page PDFs)
              ▼                                                    │
   VerificationResult ──────────────► Amazon DynamoDB ◄────────────┘
   returned to the UI                  (verification history; raw input
                                        is hashed, never stored)
```

- **Active deployment:** AWS Amplify Hosting (GitHub → `main` branch auto-deploy; build config
  in [`amplify.yml`](amplify.yml)).
- **AI provider:** **Google Gemini** (default `gemini-3.1-flash-lite`, pinned after live
  verification of the anti-fabrication suite). Provider selection is configurable via
  `AI_PROVIDER`; **Amazon Bedrock remains a future/alternative provider** — its code
  (`lib/ai/bedrock.ts`) and conditional IAM are intact, just not active.
- **Alternative serving path (dormant):** [`infrastructure/template.yaml`](infrastructure/template.yaml)
  defines an API Gateway (HTTP API) + AWS Lambda (container image via Lambda Web Adapter)
  deployment. It is validated with cfn-lint but not the current production path.

## AWS services — what is actually used and why

| Service | Status | Why it's here |
| --- | --- | --- |
| **AWS Amplify Hosting** | ✅ Active | Builds and serves the Next.js 16 app (SSR + API routes) with Git-based auto-deploys. |
| **Amazon Textract** | ✅ Active | Real OCR for uploaded documents: `DetectDocumentText` (images, 1-page PDFs) and the async S3 job flow (`StartDocumentTextDetection` → poll) for multi-page/scanned PDFs. |
| **Amazon S3** | ✅ Active | Temporary storage for uploads on their way to Textract. Random non-PII keys, AES-256 encryption, **deleted immediately after processing**, 1-day lifecycle backstop. |
| **Amazon DynamoDB** | ✅ Active | Verification history (on-demand billing, GSI for newest-first listing). Raw user input is **hashed, never stored**; persistence is best-effort and can never fail an analysis. |
| **AWS CloudWatch** | ✅ Active | Structured application logs (no document contents, no user input, no secrets) + Amplify build logs. |
| **AWS Lambda + API Gateway + Lambda Web Adapter** | 🟡 Defined, not current | The SAM stack in `infrastructure/` is a fully-working alternative deployment path (container image on Lambda behind an HTTP API). Kept validated; not what Amplify serves today. |
| **Amazon Bedrock** | 🟠 Future provider | Inactive because of an account-level Bedrock authorization restriction. Provider code, prompt, and a **conditional** IAM policy (created only when `AiProvider=bedrock`) remain ready — switching back is a config change, not a rewrite. |

No S3 public access, no secrets in code, no fabricated "official" evidence.

## The AI layer

`lib/ai/` is a provider seam (`gemini.ts` / `bedrock.ts` / `mock.ts` behind `index.ts`).
The provider only produces raw JSON text — **it is never trusted to enforce security**:

- **Anti-fabrication gate (`lib/validation.ts`, authoritative):** `USER_PROVIDED` evidence must
  quote text that verbatimly occurs in the submitted source; invented quotes and URLs are
  stripped; OFFICIAL/SEARCH evidence is rejected unless real external evidence is supplied;
  evidence-less SUPPORTED/CONTRADICTED claims are downgraded to `UNVERIFIED`; the overall
  status is recomputed from per-claim statuses (payment requests → `HIGH_RISK`; a "no fee"
  statement can never produce `HIGH_RISK`).
- **Structured output:** JSON response MIME + temperature 0; malformed output is retried once,
  then surfaces as a controlled 5xx — never a crash, never leaked internals.
- **Failure honesty:** if Gemini is unconfigured/unavailable the API fails clearly (fail-closed).
  Mock mode (`AI_PROVIDER=mock`) is an explicit dev-only opt-in; production never falls back
  to mock data.

## Document upload pipeline (PDF / PNG / JPG)

`components/FileUpload.tsx` → `POST /api/extract-document` (multipart):

1. Server-side validation (MIME **and** extension, ≤ 10 MB — the Textract sync limit).
2. Upload to S3 under a random 32-hex key in `tmp-uploads/` (original filename never stored).
3. Textract extracts the real text — async job path handles scanned/image-only PDFs (e.g. a
   2-page scanned offer letter that has no text layer).
4. A meaningfulness gate refuses to return less than ~40 alphanumeric characters —
   OCR either produces the document's actual text or the request fails with a clean `422`.
   Nothing is ever fabricated to fill the gap.
5. The S3 object is deleted in every path (success, failure, empty OCR); a 1-day lifecycle
   rule is the backstop.
6. The extracted text flows through the **existing** `/api/analyze` → Gemini → validation
   pipeline exactly like pasted text, so every evidence quote is traceable to the extracted
   document text.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Analyze pasted (or extracted) text → `VerificationResult` |
| `POST` | `/api/extract-document` | Multipart PDF/PNG/JPG → extracted text (S3 + Textract) |
| `GET` | `/api/health` | Liveness + safe config probe (provider name, `providerConfigured`, env *presence* booleans — never values) |
| `GET` | `/api/verifications?limit=20` | Recent verification history (optional feature) |

### `POST /api/analyze`

```json
{ "text": "Paste of the offer/message/listing (1–20,000 chars)" }
```

`200` →

```json
{
  "success": true,
  "result": {
    "overallStatus": "NEEDS_VERIFICATION",
    "summary": "Several claims could not be independently verified.",
    "claims": [
      {
        "id": "claim-1",
        "claim": "The sender represents Google",
        "category": "RECRUITER",
        "status": "UNVERIFIED",
        "confidence": 0.92,
        "explanation": "The provided email address does not establish that the sender is an official recruiter.",
        "evidence": [
          {
            "source": "User-provided message",
            "type": "USER_PROVIDED",
            "description": "The recruiter email appears in the submitted message.",
            "relevantText": "googlecareers@gmail.com"
          }
        ],
        "recommendedAction": "Verify the recruiter through an official company channel."
      }
    ],
    "recommendedActions": [
      "Verify the opportunity on the company's official careers website.",
      "Do not make any payment before verification."
    ]
  }
}
```

Errors: `400` invalid/empty · `413` too large · `422` no meaningful text extracted ·
`5xx` controlled `{ "success": false, "error": "..." }` — no stack traces, no AWS or
provider details. The canonical contract is [`lib/contract.ts`](lib/contract.ts)
(single source of truth for backend ↔ frontend).

## Project structure

```text
app/                        Next.js 16 App Router — UI pages + API routes
components/                 UI (Analyzer, VerificationReport, ClaimCard, FileUpload, …)
lib/contract.ts             API contract types (single source of truth)
lib/validation.ts           Anti-fabrication gate (authoritative, security-critical)
lib/analyzer.ts             Claim extraction + evaluation pipeline
lib/ai/                     Provider seam: gemini.ts / bedrock.ts / mock.ts / index.ts
lib/document-extract.ts     S3 → Textract extraction pipeline (test-injectable deps)
lib/verifications.ts        DynamoDB history (hashed input, best-effort)
lib/server-env.ts           Server-only env accessor (build-time bake for Amplify)
scripts/write-server-env.mjs  Bakes GEMINI_API_KEY/AI_PROVIDER into a gitignored
                              server-only module at build time (see note below)
tests/                      Offline unit / smoke / integration / document suites
infrastructure/             SAM template + deploy.sh (alternative Lambda deployment)
amplify.yml                 Amplify build spec
```

## Local development

```bash
npm install
cp .env.example .env.local    # fill in values — .env.local is gitignored, never commit it
npm run dev                   # http://localhost:3000
```

### Environment variables (see [`.env.example`](.env.example))

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | no (default `gemini`) | `gemini` \| `mock` (dev) \| `bedrock` (future) |
| `GEMINI_API_KEY` | yes (for real analysis) | Google AI Studio key — **server-side only**, never `NEXT_PUBLIC_*` |
| `GEMINI_MODEL` | no | Runtime override; code default is the verified `gemini-3.1-flash-lite` |
| `AWS_REGION` | no (default `us-east-1`) | Region for S3/Textract/DynamoDB (and future Bedrock) |
| `S3_UPLOADS_BUCKET` | for uploads | Temporary-upload bucket for the Textract pipeline |
| `TEXTRACT_S3_PREFIX` | no (default `tmp-uploads/`) | Key prefix for temporary uploads |
| `VERIFICATIONS_TABLE_NAME` | no | DynamoDB table; history disabled when unset |
| `NEXT_PUBLIC_USE_MOCK` | set to `false` | Only `true` enables the canned demo mode; leave unset/false for the real API |
| `NEXT_PUBLIC_API_URL` | no | Base URL for analyses; unset = same-origin (how the deployed app runs) |
| `BEDROCK_MODEL_ID` | no | Future Bedrock provider only |

> **Why a build-time env step?** Amplify Hosting (Gen 1) passes console environment variables
> to the *build* but not to the SSR runtime. `scripts/write-server-env.mjs` (wired into
> `prebuild` and `amplify.yml`) bakes `GEMINI_API_KEY`/`AI_PROVIDER` into
> `lib/server-env.generated.ts`, which is **gitignored**, imported only by
> `lib/server-env.ts`, and reachable only from server-side `/api` code — the key never
> enters any client bundle. `GEMINI_MODEL` is deliberately *not* baked so a stale console
> value can't pin a model with an exhausted quota bucket.

### AWS credentials for local runs

Textract/S3/DynamoDB calls use the standard SDK credential chain (`aws login` SSO locally).
Gemini needs no AWS permissions — it's a plain HTTPS API call from the server.

## Tests

```bash
npm test                  # analyzer + anti-fabrication validation suite (offline)
npm run test:document     # S3+Textract pipeline logic with injected fakes (offline, hermetic)
npm run test:integration  # real backend through the frontend's production code path
npx tsx tests/server-smoke.ts   # HTTP smoke checks against a running dev server
npm run test:gemini       # live Gemini end-to-end (needs GEMINI_API_KEY; uses quota)
npm run lint && npx tsc --noEmit && npm run build
```

The document suite proves, without network calls: type/size rejection, no-fabrication
meaningfulness gate, S3 cleanup on every failure path, non-PII random keys, evidence
traceability against extracted text, and that document contents are never logged.

## Deployment (current: AWS Amplify)

1. Push to `main` on <https://github.com/parnika0110/VeriFYI> — Amplify auto-builds.
2. Amplify console → Environment variables (for All branches): `GEMINI_API_KEY`
   (and optionally `AI_PROVIDER=gemini`, `S3_UPLOADS_BUCKET`).
3. Build runs `amplify.yml`: `npm ci` → bake server env → `next build`.
4. The executing AWS role (Amplify's service role, or the SAM Lambda role) needs the
   least-privilege S3 `PutObject`/`DeleteObject` on `tmp-uploads/*` and Textract document
   permissions — as defined in `infrastructure/template.yaml` for the Lambda path.

**Alternative deployment** (API Gateway + Lambda, container image):
`./infrastructure/deploy.sh` builds and deploys the SAM stack with a NoEcho `GeminiApiKey`
parameter and prints the `ApiBaseUrl` output.

## Safety & privacy

- VeriFYI does **not** establish absolute truth: statuses describe the relationship between
  claims and *available evidence only*; absence of evidence is reported as `UNVERIFIED`,
  never as proof, and nothing is ever labeled a "scam".
- Uploads are processed in memory + temporary S3 only, deleted immediately after extraction,
  never persisted in DynamoDB, and never logged. Extracted text is treated exactly like
  pasted text; evidence quotes are validated verbatim against it.
- Logs contain hashes and metadata (latency, char counts, error categories) — no raw user
  input, no document contents, no secrets. `.env*` files are gitignored; the generated
  server-env module is gitignored; API keys live only in the server environment.

## Credits

- Backend/AI/AWS: VeriFYI backend repo (this one)
- Frontend UI: built by **J Bob**, integrated into this app against `lib/contract.ts`
- Built for the **Bharat Builds by AWS × WeMakeDevs hackathon**
