/**
 * Structured JSON logging (CloudWatch-compatible).
 *
 * Rules:
 *  - never log raw user input, API keys, or AWS credentials
 *  - log request lifecycle events and latency as structured fields
 *  - user input is referenced only by a short SHA-256 hash prefix
 */

import { createHash } from "node:crypto";

const REDACTED_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_PROFILE",
  "BEDROCK_MODEL_ID",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "AI_PROVIDER",
  "GEMINI_MODEL",
];

export function hashInput(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function truncateForLog(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, event: string, fields: Record<string, unknown>): void {
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...(level === "error" && fields.error instanceof Error
      ? {
          errorName: fields.error.name,
          errorMessage: truncateForLog(fields.error.message, 300),
        }
      : {}),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields: Record<string, unknown> = {}) => emit("debug", event, fields),
  info: (event: string, fields: Record<string, unknown> = {}) => emit("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => emit("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => emit("error", event, fields),
};

/** Log which sensitive env vars are set, without values (startup diagnostics). */
export function logEnvSummary(): void {
  const summary: Record<string, boolean> = {};
  for (const key of REDACTED_ENV_KEYS) {
    summary[key] = Boolean(process.env[key]);
  }
  log.info("env_summary", summary);
}
