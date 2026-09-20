# VeriFYI — Backend

Evidence-based verification assistant for internships, job offers, and recruiter messages.

**Bharat Builds by AWS × WeMakeDevs hackathon project.** AWS is used where it genuinely
helps: **Amazon Bedrock** for claim analysis, **API Gateway + Lambda** for serving,
**DynamoDB** for history, **CloudWatch** for observability.

> Backend owner: this repo. Frontend: built separately by J Bob against the contract
> in [`lib/contract.ts`](lib/contract.ts).

## Problem

People receive internship offers, recruiter DMs, and listings that mix real facts with
fabrication. Tools that output a "scam score" give no way to challenge the verdict —
and the same score would brand both a sloppy real listing and an elaborate fake.

## Solution

VeriFYI never calls anything a "scam". It follows one pipeline:

> **CLAIM → EVIDENCE → STATUS → EXPLANATION → NEXT ACTION**

1. **CLAIM** — extract the specific factual claims from the submitted text
   (company, role, salary, recruiter identity, payment requirement, contact, domain,
   deadline, …).
2. **EVIDENCE** — attach only evidence that actually exists:
   `USER_PROVIDED` (quoted from the submitted text), `OFFICIAL` (official source quoted
   in the text), `SEARCH` (a real provided search result) — or none at all.
3. **STATUS** — evaluate each claim:
   - `SUPPORTED` — available evidence backs it
   - `UNVERIFIED` — not enough evidence to confirm *(the correct default for
     real-world claims: nobody can verify a salary from a screenshot alone)*
   - `CONTRADICTED` — available evidence conflicts with it
4. **EXPLANATION** — each status is justified using only available evidence.
5. **NEXT ACTION** — what the user can concretely do (verify via official careers page,
   don't pay before verification, …).

## Architecture

```text
Next.js (standalone)          Screenshot/PDF (optional, P1)
        │                              │
        ▼                              ▼
  API Gateway (HTTP API)         Amazon S3
        │                              │
        ▼                              ▼
   AWS Lambda  ◄── Lambda Web Adapter ── containers on Lambda
        │
        ├──► Amazon Bedrock (claim extraction + evaluation, structured JSON)
        └──► DynamoDB (verification history, best-effort)

  CloudWatch: Lambda logs (structured JSON) + API Gateway access logs
```

`POST /api/analyze` → Lambda → Bedrock → validated `VerificationResult` → client.
Persistence happens *after* the response is prepared and can never fail an analysis.

## AWS services and why each exists

| Service | Why it's here |
| --- | --- |
| **Amazon Bedrock** | The core analysis engine: claim extraction, evidence classification, status assignment, recommendations. Claude Sonnet 4.5 via the US cross-region inference profile. |
| **API Gateway (HTTP API)** | Public HTTPS entrypoint for the frontend; CORS, throttling, access logs. |
| **AWS Lambda** | Runs the Next.js backend as a container; scales to zero; pay-per-request. |
| **Lambda Web Adapter** | Lets the unmodified Next.js server run as a Lambda (streaming responses). |
| **Amazon DynamoDB** | Verification history (on-demand billing); GSI for newest-first listing. |
| **Amazon S3** | *(P1, optional)* storage for uploaded screenshots/PDFs. |
| **Amazon Textract** | *(P1, optional)* text extraction from screenshots/PDFs feeding the same analyzer. |
| **CloudWatch** | Structured Lambda logs (hashed input, latency, error category) + API access logs. |

## AI design

- **Claim extraction** — the model splits the text into 3–10 specific claims
  (company, role, salary, recruiter, payment, contact, domain, deadline, other).
- **Evidence handling & anti-fabrication** — the prompt defines a sentinel source
  `"AI internal knowledge"`; anything the model would claim from training data gets
  that source, and the validator (`lib/validation.ts`) **strips it and downgrades the
  claim to `UNVERIFIED`**. Any SUPPORTED/CONTRADICTED claim with zero surviving
  evidence is also downgraded. The model's word is never treated as evidence.
- **Uncertainty** — `UNVERIFIED` is the expected outcome for real-world claims;
  the system explains *what would be needed* to verify.
- **Structured output** — strict-JSON prompt; tolerant extraction (fences, prose);
  hand-rolled schema validation; malformed output is retried once, then surfaces as a
  controlled 5xx — never a crash, never leaked internals.
- **Status coherence** — `overallStatus` is recomputed from per-claim statuses, so
  `HIGH_RISK` always traces to a confirmed payment requirement or a contradicted claim;
  a "no fee" confirmation can never produce `HIGH_RISK`, and `VERIFIED` requires every
  claim evidence-backed with no payment involved.

## API

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

Errors: `400` invalid/empty · `413` too large · `5xx` controlled `{ "success": false, "error": "..." }`
(no stack traces, no AWS details). Full types: [`lib/contract.ts`](lib/contract.ts).

### `GET /api/health`

Liveness + configuration probe: `{ ok, service, time, bedrockConfigured, dynamodbConfigured }`.

### `GET /api/verifications?limit=20`

Recent verification history (optional feature; demo does not depend on it).

## Safety

VeriFYI does **not** establish absolute truth. Statuses describe the relationship
between claims and *available evidence only*; absence of evidence is reported as
`UNVERIFIED`, never as proof. Users should independently verify sensitive information
(offers, payments, identity) through official channels before acting. The system will
not label anything a "scam".

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values (never commit .env*)
npm run dev                  # http://localhost:3000
npm test                     # 17 offline cases + typecheck guard
npm run test:live            # 3 live Bedrock cases (needs valid AWS creds)
npm run build && npx tsx tests/server-smoke.ts   # 14 HTTP smoke checks
                             # (phase B uses MOCK_BEDROCK=1, a dev-only seam)
```

### Environment variables (see `.env.example`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `AWS_REGION` | yes (default `us-east-1`) | Bedrock/DynamoDB region; credentials come from the default chain (`aws login` SSO locally, Lambda role in production) |
| `BEDROCK_MODEL_ID` | no | Override the model; default `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `VERIFICATIONS_TABLE_NAME` | no | DynamoDB table; history disabled when unset |
| `UPLOADS_BUCKET_NAME` | no | S3 bucket (P1 uploads; disabled when unset) |

## Deployment

```bash
aws login                    # valid AWS session
# start Docker Desktop, then:
./infrastructure/deploy.sh   # or: AWS_REGION=ap-south-1 STACK_NAME=verifiy-backend ./infrastructure/deploy.sh
```

The script installs the SAM CLI if missing, builds the container image, deploys
(`infrastructure/template.yaml`: HttpApi + Lambda + DynamoDB, least-privilege IAM),
then prints `ApiBaseUrl`, the `POST /api/analyze` endpoint, and the health probe.

First deploy notes:
- Enable **Bedrock model access** for Claude Sonnet 4.5 in the target region:
  <https://console.aws.amazon.com/bedrock/home?#/modelaccess>
- CORS defaults to `*` for the hackathon; set `CORS_ORIGIN` to the frontend origin
  before a public launch.
- Logs: CloudWatch log groups `/aws/lambda/verifiy-backend-<stack>` and
  `/aws/http-api/verifiyi-<stack>`.
