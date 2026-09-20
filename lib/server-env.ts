/**
 * Server-side environment accessor.
 *
 * Resolution order per key:
 *   1. Real runtime process.env (works if the platform ever delivers it).
 *   2. Values captured at BUILD time into lib/server-env.generated.ts
 *      (Amplify Gen 1 passes console variables to the build, not the runtime).
 *
 * SERVER-SIDE ONLY: import this (directly or transitively) exclusively from
 * server code — /api routes and lib/ai/*. Never import from client components.
 */
import { SERVER_ENV } from "./server-env.generated";

export type ServerEnvKey = keyof typeof SERVER_ENV;

export function serverEnv(name: ServerEnvKey): string {
  const runtimeValue = process.env[name];
  if (runtimeValue && runtimeValue.trim()) return runtimeValue.trim();
  return SERVER_ENV[name] ?? "";
}
