/**
 * Live Gemini end-to-end check for /api/analyze.
 *
 * Requires GEMINI_API_KEY in .env.local (Next.js loads it automatically for
 * `next start`). Runs the two required samples and asserts the
 * anti-fabrication guarantees on REAL Gemini output:
 *   - suspicious sample: payment claim represented, evidence quotes verbatim
 *     from the submitted text, no OFFICIAL/SEARCH (fabricated) evidence
 *   - benign sample: NOT automatically HIGH_RISK
 *
 * Usage:
 *   npm run build
 *   GEMINI_API_KEY=... npx tsx tests/live-gemini.ts
 * (or create .env.local with GEMINI_API_KEY=... before building)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 3011;
const BASE = `http://127.0.0.1:${PORT}`;
const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const SUSPICIOUS = `Congratulations! You have been selected for an AI internship.
Salary Rs 80,000/month.
Pay Rs 1,500 onboarding fee.
Contact recruiter at googlecareers@gmail.com.`;

const BENIGN = `We are hiring a frontend intern. Applications close on 30 September.
Apply using the form below.`;

interface Claim {
  id?: string;
  claim?: string;
  category?: string;
  status?: string;
  confidence?: number;
  explanation?: string;
  evidence?: Array<{ source?: string; type?: string; description?: string; relevantText?: string }>;
  recommendedAction?: string;
}

interface AnalyzeBody {
  success?: boolean;
  result?: { overallStatus?: string; summary?: string; claims?: Claim[]; recommendedActions?: string[] };
  error?: string;
}

/** Load GEMINI_API_KEY from .env.local if present (never prints it). */
function loadEnvKey(): string | undefined {
  const envFile = join(process.cwd(), ".env.local");
  if (!existsSync(envFile)) return undefined;
  const match = readFileSync(envFile, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

function spawnServer(): ChildProcess {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(PORT),
  };
  if (!env["GEMINI_API_KEY"]) {
    const key = loadEnvKey();
    if (key) env["GEMINI_API_KEY"] = key;
  }
  if (!env["GEMINI_API_KEY"]) {
    console.error("FAIL: GEMINI_API_KEY not set (env or .env.local). Cannot run live Gemini check.");
    process.exit(1);
  }
  delete env["MOCK_BEDROCK"];
  delete env["AI_PROVIDER"];
  return spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    env: env as NodeJS.ProcessEnv,
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
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function analyze(text: string): Promise<{ status: number; body: AnalyzeBody }> {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: (await res.json()) as AnalyzeBody };
}

function assertQuoteTraceability(claims: Claim[], sourceText: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[\u2018\u2019\u201c\u201d'"]/g, "").replace(/\s+/g, " ").trim();
  const haystack = normalize(sourceText);
  return claims.every((claim) =>
    (claim.evidence ?? []).every(
      (e) => e.type !== "USER_PROVIDED" || (typeof e.relevantText === "string" && haystack.includes(normalize(e.relevantText))),
    ),
  );
}

async function main(): Promise<void> {
  console.log("Booting server with Gemini configured ...");
  const server = spawnServer();
  let failures = 0;

  try {
    if (!(await waitForServer(45_000))) {
      console.error("FAIL: server did not become ready");
      process.exitCode = 1;
      return;
    }

    const health = (await (await fetch(`${BASE}/api/health`)).json()) as { provider?: string; service?: string };
    console.log(`health: service=${health.service} provider=${health.provider}\n`);

    // ---- Sample 1: suspicious -----------------------------------------
    console.log("SAMPLE 1 (suspicious):");
    const startedAt = Date.now();
    const suspicious = await analyze(SUSPICIOUS);
    const elapsed = Date.now() - startedAt;
    console.log(`  HTTP ${suspicious.status} in ${elapsed}ms`);
    const s = suspicious.body;

    if (suspicious.status !== 200 || s.success !== true || !s.result) {
      console.log(`  FAIL: expected 200 success, got: ${JSON.stringify(s).slice(0, 300)}`);
      failures += 1;
    } else {
      const result = s.result;
      console.log(`  overallStatus=${result.overallStatus} claims=${result.claims?.length}`);
      for (const claim of result.claims ?? []) {
        console.log(`   - [${claim.category}] ${claim.status} :: ${claim.claim}`);
      }
      const payment = (result.claims ?? []).find((c) => c.category === "PAYMENT");
      const okPayment =
        !!payment &&
        payment.status === "SUPPORTED" &&
        (payment.evidence ?? []).some(
          (e) => typeof e.relevantText === "string" && /1,?500/i.test(e.relevantText ?? ""),
        );
      const noFabricated = (result.claims ?? []).every((c) =>
        (c.evidence ?? []).every((e) => e.type === "USER_PROVIDED"),
      );
      const traceable = assertQuoteTraceability(result.claims ?? [], SUSPICIOUS);
      const noScam = !JSON.stringify(result).toLowerCase().includes("scam");

      console.log(`  payment claim SUPPORTED with Rs 1,500 evidence: ${okPayment ? "OK" : "FAIL"}`);
      console.log(`  all evidence USER_PROVIDED (no fabricated OFFICIAL/SEARCH): ${noFabricated ? "OK" : "FAIL"}`);
      console.log(`  every quote traces to the submitted text: ${traceable ? "OK" : "FAIL"}`);
      console.log(`  no \"scam\" language: ${noScam ? "OK" : "FAIL"}`);
      if (!(okPayment && noFabricated && traceable && noScam)) failures += 1;
    }

    // ---- Sample 2: benign ---------------------------------------------
    console.log("\nSAMPLE 2 (benign):");
    const benign = await analyze(BENIGN);
    console.log(`  HTTP ${benign.status}`);
    const b = benign.body;
    if (benign.status !== 200 || b.success !== true || !b.result) {
      console.log(`  FAIL: expected 200 success, got: ${JSON.stringify(b).slice(0, 300)}`);
      failures += 1;
    } else {
      const notHighRisk = b.result.overallStatus !== "HIGH_RISK";
      const hasClaims = (b.result.claims ?? []).length > 0;
      const traceable = assertQuoteTraceability(b.result.claims ?? [], BENIGN);
      console.log(`  overallStatus=${b.result.overallStatus} claims=${b.result.claims?.length}`);
      console.log(`  NOT automatically HIGH_RISK: ${notHighRisk ? "OK" : "FAIL"}`);
      console.log(`  claims extracted: ${hasClaims ? "OK" : "FAIL"}`);
      console.log(`  quotes traceable: ${traceable ? "OK" : "FAIL"}`);
      if (!(notHighRisk && hasClaims && traceable)) failures += 1;
    }
  } finally {
    server.kill();
  }

  console.log(`\nRESULT: live Gemini check ${failures === 0 ? "PASSED" : `FAILED (${failures} issue(s))`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
