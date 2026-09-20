# VeriFYI API — quick reference for the frontend

Import types directly: `import type { AnalyzeResponse, VerificationResult } from "@/lib/contract"`.
Everything below mirrors `lib/contract.ts` (the single source of truth).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Analyze offer/message text → `VerificationResult` |
| `GET` | `/api/health` | Liveness + which AWS features are configured |
| `GET` | `/api/verifications?limit=20` | Recent verification history (optional) |

Production base URL: **printed by `./infrastructure/deploy.sh`** (share from the deploy output — `https://<api-id>.execute-api.<region>.amazonaws.com`). All paths below are appended to that base.

## POST /api/analyze

Request:

```json
{ "text": "paste of the offer/message/listing (1–20,000 chars)" }
```

Response `200`:

```json
{ "success": true, "result": { /* VerificationResult */ } }
```

Errors — always the same envelope:

```json
{ "success": false, "error": "human-readable message" }
```

| HTTP | When |
| --- | --- |
| 400 | missing/non-string/empty `text`, malformed JSON body |
| 413 | `text` over 20,000 chars |
| 500 | analysis failed (model/AWS) — controlled message, no internals |
| 504 | upstream timeout |

Discriminate success by `"result" in response` or `"success" === true`.

## VerificationResult shape

```ts
interface VerificationResult {
  overallStatus: "VERIFIED" | "NEEDS_VERIFICATION" | "HIGH_RISK";
  summary: string;
  claims: Claim[];               // 1–15
  recommendedActions: string[];  // 0–8
}

interface Claim {
  id: string;                    // "claim-1", "claim-2", ...
  claim: string;
  category: "COMPANY" | "ROLE" | "SALARY" | "RECRUITER" | "PAYMENT"
          | "CONTACT" | "DOMAIN" | "DEADLINE" | "OTHER";
  status: "SUPPORTED" | "UNVERIFIED" | "CONTRADICTED";
  confidence: number;            // 0..1 — confidence in the STATUS
  explanation: string;
  evidence: Evidence[];          // 0–5; empty list == no evidence
  recommendedAction?: string;
}

interface Evidence {
  source: string;                // e.g. "User-provided message"
  type: "USER_PROVIDED" | "OFFICIAL" | "SEARCH";
  description: string;
  relevantText?: string;         // exact short quote from the input
}
```

UI notes:
- `UNVERIFIED` with `evidence: []` is the **normal** outcome for real-world claims —
  it is the product working as designed, not a failure.
- `HIGH_RISK` is always traceable to a confirmed payment requirement or a
  `CONTRADICTED` claim. Never display the word "scam" — that's a product rule.

## GET /api/health

```json
{ "ok": true, "service": "verifyi-backend", "time": "ISO-8601",
  "bedrockConfigured": true, "dynamodbConfigured": true }
```

## CORS

`POST`/`GET`/`OPTIONS` are allowed with `Content-Type: application/json`.
Default origin is `*` for the hackathon (set `CORS_ORIGIN` at deploy time to lock it).
