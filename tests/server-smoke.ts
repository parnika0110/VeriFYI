/**
 * Server smoke test (self-contained: boots, probes, tears down).
 *
 * Requires a production build (`npm run build`) since it runs `next start`.
 *
 * Two phases (both hermetic: AI env is pinned explicitly so a developer's
 * .env.local cannot leak into the harness):
 *   A) server with an UNCONFIGURED provider: input-validation status codes
 *      (400/413) and the controlled 5xx when no AI provider is usable.
 *   B) server with the mock provider via legacy MOCK_BEDROCK=1: the full
 *      valid POST /api/analyze 200 contract, offline and deterministic.
 *
 * Usage: npx tsx tests/server-smoke.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 3010;
const BASE = `http://127.0.0.1:${PORT}`;
const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

interface Check {
  name: string;
  fn: () => Promise<boolean>;
}

function spawnServer(env: Record<string, string>): ChildProcess {
  return spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function postAnalyze(body: unknown): Promise<Response> {
  return fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/* Phase A — validation + controlled failure (no mock, no AWS creds)   */
/* ------------------------------------------------------------------ */

const PHASE_A: Check[] = [
  {
    name: "A1 GET /api/health -> 200 with expected shape",
    fn: async () => {
      const res = await fetch(`${BASE}/api/health`);
      const body = (await res.json()) as Record<string, unknown>;
      return (
        res.status === 200 &&
        body.ok === true &&
        body.service === "verifyi-backend" &&
        typeof body.bedrockConfigured === "boolean" &&
        typeof body.dynamodbConfigured === "boolean" &&
        typeof body.providerConfigured === "boolean"
      );
    },
  },
  {
    name: "A2 POST /api/analyze {} (missing text) -> 400",
    fn: async () => (await postAnalyze({})).status === 400,
  },
  {
    name: "A3 POST /api/analyze text not a string -> 400",
    fn: async () => (await postAnalyze({ text: 42 })).status === 400,
  },
  {
    name: "A4 POST /api/analyze empty text -> 400",
    fn: async () => (await postAnalyze({ text: "" })).status === 400,
  },
  {
    name: "A5 POST /api/analyze whitespace-only text -> 400",
    fn: async () => (await postAnalyze({ text: "   \n  " })).status === 400,
  },
  {
    name: "A6 POST /api/analyze malformed JSON body -> 400",
    fn: async () => (await postAnalyze("{not json")).status === 400,
  },
  {
    name: "A7 POST /api/analyze oversized text -> 413",
    fn: async () => (await postAnalyze({ text: "a".repeat(21_000) })).status === 413,
  },
  {
    name: "A8 POST /api/analyze array body -> 400",
    fn: async () => (await postAnalyze(["text"])).status === 400,
  },
  {
    name: "A9 valid text with no configured AI provider -> controlled 5xx JSON, no internal leak",
    fn: async () => {
      const res = await postAnalyze({ text: "Congratulations! You have been selected. Pay Rs 1,500 fee." });
      const body = (await res.json()) as { success?: boolean; error?: string };
      const controlled = [500, 502, 503, 504].includes(res.status);
      const noLeak =
        typeof body.error === "string" &&
        !body.error.includes("arn:") &&
        !body.error.includes("AccessDenied") &&
        !body.error.includes("stack");
      return controlled && body.success === false && noLeak;
    },
  },
  {
    name: "A10 unknown API path -> 404",
    fn: async () => (await fetch(`${BASE}/api/does-not-exist`)).status === 404,
  },
];

/* ------------------------------------------------------------------ */
/* Phase B — valid 200 contract (MOCK_BEDROCK=1)                       */
/* ------------------------------------------------------------------ */

const VALID_SUSPICIOUS =
  "You have been selected for an internship. Pay \u20b9999 registration fee.";

function isValidVerificationResult(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const r = result as Record<string, unknown>;
  if (!["VERIFIED", "NEEDS_VERIFICATION", "HIGH_RISK"].includes(String(r.overallStatus))) return false;
  if (typeof r.summary !== "string" || !r.summary) return false;
  if (!Array.isArray(r.claims) || r.claims.length === 0) return false;
  if (!Array.isArray(r.recommendedActions)) return false;
  const categories = new Set([
    "COMPANY", "ROLE", "SALARY", "RECRUITER", "PAYMENT", "CONTACT", "DOMAIN", "DEADLINE", "OTHER",
  ]);
  const statuses = new Set(["SUPPORTED", "UNVERIFIED", "CONTRADICTED"]);
  for (const raw of r.claims) {
    if (typeof raw !== "object" || raw === null) return false;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.claim !== "string") return false;
    if (!categories.has(String(c.category)) || !statuses.has(String(c.status))) return false;
    if (typeof c.confidence !== "number" || c.confidence < 0 || c.confidence > 1) return false;
    if (typeof c.explanation !== "string") return false;
    if (!Array.isArray(c.evidence)) return false;
    for (const rawE of c.evidence) {
      if (typeof rawE !== "object" || rawE === null) return false;
      const e = rawE as Record<string, unknown>;
      if (typeof e.source !== "string" || typeof e.description !== "string") return false;
      if (!["USER_PROVIDED", "OFFICIAL", "SEARCH"].includes(String(e.type))) return false;
    }
  }
  return true;
}

const PHASE_B: Check[] = [
  {
    name: "B1 valid suspicious text -> 200 + full VerificationResult contract",
    fn: async () => {
      const res = await postAnalyze({ text: VALID_SUSPICIOUS });
      const body = (await res.json()) as { success?: boolean; result?: unknown };
      return res.status === 200 && body.success === true && isValidVerificationResult(body.result);
    },
  },
  {
    name: "B2 payment request in text -> HIGH_RISK with SUPPORTED payment claim",
    fn: async () => {
      const res = await postAnalyze({ text: VALID_SUSPICIOUS });
      const body = (await res.json()) as {
        result?: { overallStatus?: string; claims?: Array<{ category?: string; status?: string; claim?: string }> };
      };
      const result = body.result;
      if (!result) return false;
      const payment = (result.claims ?? []).find((c) => c.category === "PAYMENT");
      return (
        result.overallStatus === "HIGH_RISK" &&
        !!payment &&
        payment.status === "SUPPORTED" &&
        typeof payment.claim === "string" &&
        payment.claim.toLowerCase().includes("payment")
      );
    },
  },
  {
    name: "B3 no payment in text -> NEEDS_VERIFICATION (not HIGH_RISK)",
    fn: async () => {
      const res = await postAnalyze({
        text: "We are looking for a design intern. Apply via the careers page with your portfolio.",
      });
      const body = (await res.json()) as { result?: { overallStatus?: string } };
      return res.status === 200 && body.result?.overallStatus === "NEEDS_VERIFICATION";
    },
  },
  {
    name: "B4 SUPPORTED claims only carry traceable verbatim evidence",
    fn: async () => {
      const res = await postAnalyze({ text: VALID_SUSPICIOUS });
      const body = (await res.json()) as {
        result?: { claims?: Array<{ status?: string; evidence?: Array<{ relevantText?: string }> }> };
      };
      const claims = body.result?.claims ?? [];
      return claims
        .filter((c) => c.status === "SUPPORTED")
        .every((c) => (c.evidence ?? []).every((e) => typeof e.relevantText === "string"));
    },
  },
  {
    name: "B5 GET / -> 200 and serves the VeriFYI frontend shell",
    fn: async () => {
      const res = await fetch(`${BASE}/`);
      if (res.status !== 200) return false;
      const html = await res.text();
      return html.includes("VeriFYI");
    },
  },
];

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

async function runPhase(name: string, env: Record<string, string>, checks: Check[]): Promise<number> {
  console.log(`\n=== Phase ${name} ===`);
  const server = spawnServer(env);
  let failures = 0;
  try {
    const up = await waitForServer(45_000);
    if (!up) {
      console.error("FAIL: server did not become ready in time");
      return checks.length;
    }
    for (const check of checks) {
      try {
        const ok = await check.fn();
        console.log(`${ok ? "PASS" : "FAIL"}: ${check.name}`);
        if (!ok) failures += 1;
      } catch (error) {
        console.error(`FAIL: ${check.name} (${error instanceof Error ? error.message : String(error)})`);
        failures += 1;
      }
    }
  } finally {
    server.kill();
  }
  return failures;
}

async function main(): Promise<void> {
  let failures = 0;
  let total = 0;

  failures += await runPhase("A: validation + controlled failure", {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "", // unconfigured -> controlled 5xx path
  }, PHASE_A);
  total += PHASE_A.length;

  failures += await runPhase("B: valid contract (legacy MOCK_BEDROCK=1)", {
    AI_PROVIDER: "", // empty -> not explicit, exercises the legacy flag path
    MOCK_BEDROCK: "1",
    GEMINI_API_KEY: "",
  }, PHASE_B);
  total += PHASE_B.length;

  console.log(`\nRESULT: ${total - failures}/${total} smoke checks passed`);
  process.exitCode = failures > 0 ? 1 : 0;
}

void main();
