/**
 * One-off Gemini diagnostic (not part of the test suite).
 *
 * 1. Validates GEMINI_API_KEY directly against Google's model-list endpoint
 *    (distinguishes "bad key" from "bad model ID / SDK usage").
 * 2. Calls the real provider with a trivial prompt and prints the full,
 *    key-redacted error.
 *
 * Usage: npx tsx tests/gemini-diag.ts
 */

import { readFileSync } from "node:fs";

// tsx does not auto-load .env.local — load it manually.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const KEY = process.env.GEMINI_API_KEY ?? "";

function redact(text: string): string {
  return KEY ? text.split(KEY).join("***REDACTED***") : text;
}

async function main(): Promise<void> {
  // Step 1: key validity + available models (cheap, decisive).
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": KEY },
    });
    const body = (await res.json()) as {
      models?: Array<{ name?: string }>;
      error?: { code?: number; message?: string; status?: string };
    };
    if (!res.ok) {
      console.log(`KEY CHECK: HTTP ${res.status} ${body.error?.status ?? ""}`);
      console.log(redact(JSON.stringify(body.error, null, 2)));
      return;
    }
    const names = (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    console.log(`KEY CHECK: OK (${names.length} models visible)`);
    const flashLike = names.filter((n) => /flash/i.test(n)).slice(0, 15);
    console.log("flash-family models:", flashLike.join(", ") || "(none)");
  } catch (error) {
    console.log("KEY CHECK: network failure:", redact(error instanceof Error ? error.message : String(error)));
    return;
  }

  // Step 2: the real provider call.
  console.log("\nSDK CALL:");
  const { invokeGeminiText } = await import("../lib/ai/gemini");
  try {
    const result = await invokeGeminiText('Return exactly this JSON object and nothing else: {"ok":true}');
    console.log("SUCCESS. model:", result.modelId, "stopReason:", result.stopReason);
    console.log("text:", result.text.slice(0, 300));
  } catch (error) {
    console.log(redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      console.log("cause:", redact(cause.message));
    } else if (cause) {
      console.log("cause:", redact(JSON.stringify(cause)));
    }
  }
  process.exit(0);
}

void main();
