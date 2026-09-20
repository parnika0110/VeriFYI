/**
 * Frontend <-> backend integration test.
 *
 * Boots the production server (mock AI provider) and pushes REAL /api/analyze
 * responses through J Bob's production code path — analyzeClaim() ->
 * normalizeReport() from lib/api.ts — asserting the UI receives a valid
 * AnalysisReport for both the suspicious and benign samples.
 *
 * Usage: npm run build && npm run test:integration
 */

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// NOTE: lib/api.ts reads NEXT_PUBLIC_* at module load, so it MUST be
// dynamically imported inside main() AFTER the env vars are set — a static
// import would be hoisted above the assignments and silently re-enable
// the frontend's canned mock mode.

const PORT = Number(process.env.SMOKE_PORT ?? 3012);
const BASE = `http://127.0.0.1:${PORT}`;
const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const SUSPICIOUS = `Congratulations! You have been selected for an AI internship.
Salary Rs 80,000/month.
Pay Rs 1,500 onboarding fee.
Contact recruiter at googlecareers@gmail.com.`;

const BENIGN = `We are hiring a frontend intern. Applications close on 30 September.
Apply using the form below.`;

function spawnServer(): ChildProcess {
  return spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AI_PROVIDER: "mock", // hermetic: overrides any AI_PROVIDER in .env.local
      MOCK_BEDROCK: "1",
      GEMINI_API_KEY: "",
    },
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

async function main(): Promise<void> {
  // Set frontend env first, THEN load lib/api.ts (order matters, see note).
  process.env.NEXT_PUBLIC_USE_MOCK = "false";
  process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${PORT}`;
  const { analyzeClaim } = await import("../lib/api");

  const server = spawnServer();
  let failures = 0;
  try {
    if (!(await waitForServer(45_000))) {
      console.error("FAIL: server did not become ready");
      process.exitCode = 1;
      return;
    }

    // --- suspicious sample through the real frontend path ---------------
    const suspicious = await analyzeClaim({ text: SUSPICIOUS });
    console.log(`suspicious -> overallStatus=${suspicious.overallStatus} claims=${suspicious.claims.length}`);
    const checks: Array<[string, boolean]> = [
      ["HIGH_RISK for payment text", suspicious.overallStatus === "HIGH_RISK"],
      ["claims extracted", suspicious.claims.length > 0],
      [
        "payment claim present and SUPPORTED",
        suspicious.claims.some((c) => c.category === "PAYMENT" && c.status === "SUPPORTED"),
      ],
      [
        "evidence quotes arrive as USER_INPUT origin with excerpt text",
        suspicious.claims.some((c) =>
          c.evidence.some((e) => e.origin === "USER_INPUT" && e.excerpt.length > 0),
        ),
      ],
      [
        "per-claim actions populated (from recommendedAction)",
        suspicious.claims.some((c) => c.actions.length > 0),
      ],
      ["summary present", suspicious.summary.length > 0],
      ["no 'scam' language anywhere", !JSON.stringify(suspicious).toLowerCase().includes("scam")],
    ];

    // --- benign sample through the real frontend path --------------------
    const benign = await analyzeClaim({ text: BENIGN });
    console.log(`benign     -> overallStatus=${benign.overallStatus} claims=${benign.claims.length}`);
    checks.push(["benign NOT automatically HIGH_RISK", benign.overallStatus !== "HIGH_RISK"]);
    checks.push(["benign claims extracted", benign.claims.length > 0]);

    for (const [name, ok] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
      if (!ok) failures += 1;
    }

    console.log(
      `\nRESULT: frontend integration ${failures === 0 ? "PASSED" : `FAILED (${failures})`}`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    server.kill();
  }
}

void main();
