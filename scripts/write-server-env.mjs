#!/usr/bin/env node
/**
 * Amplify build step: bakes build-time environment into a SERVER-ONLY module.
 *
 * Why: Amplify Hosting (Gen 1) passes console environment variables to the
 * BUILD but not to the SSR runtime, so server-only config (GEMINI_API_KEY)
 * must be captured here.
 *
 * Security:
 *  - The generated file is gitignored and never committed.
 *  - It is imported only by lib/server-env.ts, which is used exclusively by
 *    lib/ai/* (reachable only from /api routes) — never client components.
 *  - Values are never printed to stdout or build logs.
 */
import fs from "node:fs";
import path from "node:path";

// GEMINI_MODEL is deliberately NOT captured: the console value may pin a
// model whose free-tier daily quota (per model, per project) is already
// exhausted, and a stale baked value would override the code default.
// The verified default lives in lib/ai/gemini.ts (DEFAULT_GEMINI_MODEL);
// local development can still set GEMINI_MODEL via runtime env (.env.local).
const KEYS = ["GEMINI_API_KEY", "AI_PROVIDER", "AWS_REGION", "S3_UPLOADS_BUCKET", "VERIFICATIONS_TABLE_NAME"];

function readDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const dotEnv = readDotEnvLocal();
const values = {};
for (const k of KEYS) {
  values[k] = (process.env[k] || dotEnv[k] || "").trim();
}

const body =
  "// GENERATED FILE — do not edit, do not commit (see .gitignore).\n" +
  "// Written by scripts/write-server-env.cjs during the build from the\n" +
  "// build-time environment (Amplify console variables / local .env.local).\n" +
  "// SERVER-SIDE ONLY: imported solely by lib/server-env.ts (lib/ai/* is\n" +
  "// reachable only from /api routes). Never import from client code.\n" +
  "export const SERVER_ENV = {\n" +
  KEYS.map((k) => `  ${k}: ${JSON.stringify(values[k])},`).join("\n") +
  "\n} as const;\n";

fs.writeFileSync(path.join(process.cwd(), "lib", "server-env.generated.ts"), body);
console.log(
  "server-env.generated.ts written (GEMINI_API_KEY present:",
  values.GEMINI_API_KEY.length > 0,
  ")",
);
