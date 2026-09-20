# VeriFYI — Backend Integration Handoff

Everything the frontend needs from the analysis backend, and exactly where it plugs in.
The frontend is complete and demo-ready in MOCK mode; nothing frontend-side blocks on this.

---

## 1. The one integration point

**`lib/api.ts`** is the only file that talks to the network. Components never call `fetch`.

`analyzeReal()` currently POSTs to:

```
POST  {NEXT_PUBLIC_API_URL}/api/analyze
Body: { "text": "message or job listing" }
```

To go live:

1. Implement the endpoint (any stack — the frontend only speaks JSON over HTTP).
2. Set env vars in `verifyi/.env.local`:
   ```
   NEXT_PUBLIC_USE_MOCK=false
   NEXT_PUBLIC_API_URL=http://localhost:3001   # your server's base URL, no trailing slash
   ```
3. Restart `npm run dev`. The navbar pill flips from **MOCK DATA** to **LIVE API** automatically.

CORS: the frontend runs on `localhost:3000` in dev — allow that origin (or `*` for the hackathon).

## 2. Response contract

```json
{
  "overallStatus": "HIGH_RISK",
  "summary": "Several claims require verification.",
  "claims": [
    {
      "id": "1",
      "claim": "The recruiter represents the company",
      "category": "RECRUITER",
      "status": "UNVERIFIED",
      "confidence": 0.92,
      "explanation": "No independently verifiable evidence connecting the recruiter to the claimed organization was provided.",
      "actions": [
        "Verify the recruiter's identity through the company's official website"
      ],
      "evidence": [
        {
          "source": "Message text",
          "excerpt": "Contact recruiter at googlecareers@gmail.com",
          "stance": "NEUTRAL",
          "origin": "USER_INPUT"
        },
        {
          "source": "google.com/careers",
          "url": "https://careers.google.com/",
          "excerpt": "Quoted passage the finding rests on.",
          "stance": "CONTRADICTS",
          "origin": "WEB"
        }
      ]
    }
  ]
}
```

### Field rules (enforced by `normalizeReport()` — the UI is resilient, but please match these)

| Field | Values | Notes |
| --- | --- | --- |
| `status` | `SUPPORTED` \| `UNVERIFIED` \| `CONTRADICTED` | Unknown values fall back to `UNVERIFIED` |
| `overallStatus` | `ALL_SUPPORTED` \| `PARTIALLY_VERIFIED` \| `NEEDS_VERIFICATION` \| `HIGH_RISK` \| `NO_CLAIMS` | Optional — derived from counts if missing/unknown |
| `category` | `RECRUITER` `COMPANY` `COMPENSATION` `PAYMENT` `CONTACT` `SCHOLARSHIP` `COURSE` `URGENCY` `OTHER` | Unknown → `OTHER` |
| `confidence` | `0`–`1` (a `0`–`100` value is auto-divided) | Confidence in the assigned **status** |
| `explanation` | string | The AI's reasoning — rendered under the literal label "AI explanation" |
| `actions` | string[] (optional) | Per-claim next steps; rolled into the report checklist |
| `evidence` | array, may be **empty** | Empty renders an honest "No evidence found" panel |

### Evidence `origin` — the product-critical field

| Value | Meaning | UI treatment |
| --- | --- | --- |
| `USER_INPUT` | Quoted from the user's own text | Neutral gray chip, labeled **"Your input"** |
| `WEB` | Retrieved from an external source | Accent chip, labeled **"External evidence"** |
| `DOCUMENT` | Extracted from an uploaded file | Accent chip, labeled **"Document"** |
| `AI_EXPLANATION` | Model-generated text, not a source | Gray chip, labeled **"AI explanation"** |

**Product principle:** never send the user's own text as `origin: "WEB"`. The whole UI exists to keep
user input, external evidence, and AI reasoning visually distinct. Only attach a `url` that a real,
verifiable page backs — if retrieval found nothing, return an empty `evidence` array.

## 3. Error handling contract

The frontend maps failures to calm, human error states (never raw errors):

| Your backend returns | Frontend shows |
| --- | --- |
| Unreachable / CORS / connection refused | "Connection problem — check your connection and try again" |
| Non-200 (any) | "VeriFYI couldn't complete the analysis. Please try again." (429 gets a rate-limit variant) |
| 200 with non-JSON / missing `claims` | "Unexpected response — retrying usually fixes this" |
| 200 with `claims: []` or all-invalid claims | Same "unexpected response" path |
| >45s | Timeout message (client-side `AbortSignal.timeout`) |

Partial normalization is tolerated (wrong casing, missing `actions`, string confidences), so you can
iterate on the model output without frontend changes.

## 4. File uploads (second integration point, lower priority)

`components/FileUpload.tsx` — the block marked `BACKEND INTEGRATION POINT` currently simulates
processing. When ready:

1. Expose an upload endpoint (planned: S3 presigned upload + Textract/OCR text extraction).
2. In `handleFile` (FileUpload.tsx), replace the mock timer with the real upload; on success keep
   setting `UploadedFile` so the preview UI works unchanged.
3. Feed extracted text into `/api/analyze` as `text` (or extend the request shape with a `fileRef` —
   coordinate; `lib/api.ts` is the only place to touch).

Client-side validation already enforced: PNG/JPG/PDF only, ≤10 MB, friendly invalid-file/too-large
messages.

## 5. Demo notes

- Mock mode (`NEXT_PUBLIC_USE_MOCK=true`) returns three canned reports:
  - **Suspicious offer** → HIGH RISK (0 supported / 3 unverified / 2 contradicted)
  - **Ambiguous message** ("shortlisted…") → NEEDS_VERIFICATION (0 / 3 / 0)
  - **Legitimate offer** (Razorpay-style) → PARTIALLY_VERIFIED (3 / 1 / 0)
  Selection is by keyword (`razorpay`, `shortlisted`) — see `getMockReport` in `lib/mock-data.ts`.
- The real API must reproduce this *shape* of behavior: UNVERIFIED is a first-class result. Never
  return statuses implying "scam" — the product never uses that word, by design.
- A "Copy JSON" button on the report gives judges/developers the exact normalized object.

## 6. Frontend contact points

- Types: `lib/types.ts` (single source of truth for the contract)
- Normalization + errors: `lib/api.ts` (`VerifyiError` kinds: `network | api | invalid-response | empty-input | file | unknown`)
- Status/category metadata: `lib/status.ts`
- Mock reference data: `lib/mock-data.ts`
