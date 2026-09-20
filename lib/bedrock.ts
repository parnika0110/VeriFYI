/**
 * Thin wrapper around Amazon Bedrock's Converse API.
 *
 * Responsibilities:
 *  - create/configure the BedrockRuntimeClient from env (no hardcoded creds;
 *    the SDK's default credential chain handles SSO / env / IAM role)
 *  - invoke the configured model with a text prompt
 *  - return the raw text output and latency for logging/metrics
 *
 * This module deliberately knows nothing about VeriFYI's claim schema —
 * that parsing/validation lives in lib/analyzer.ts.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

export const DEFAULT_MODEL_ID =
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

export const MAX_TOKENS = 4096;
export const BEDROCK_TEMPERATURE = 0;

export interface BedrockConfig {
  region: string;
  modelId: string;
}

export function getBedrockConfig(): BedrockConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    modelId: process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID,
  };
}

/** True when Bedrock appears usable in this environment (for /api/health). */
export function isBedrockConfigured(): boolean {
  // Credentials come from the default chain (SSO, env vars, Lambda role).
  // We can only report whether the required env config is present; actual
  // IAM/model access is verified at invoke time.
  return Boolean(getBedrockConfig().region && getBedrockConfig().modelId);
}

let cachedClient: BedrockRuntimeClient | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    const { region } = getBedrockConfig();
    cachedClient = new BedrockRuntimeClient({ region });
  }
  return cachedClient;
}

export interface BedrockInvokeResult {
  text: string;
  modelId: string;
  latencyMs: number;
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Send a user prompt (plus optional system prompt) to the configured model
 * and return the concatenated text response.
 */
export async function invokeBedrockText(
  prompt: string,
  system?: string,
): Promise<BedrockInvokeResult> {
  const { modelId } = getBedrockConfig();
  const client = getBedrockClient();

  const messages: Message[] = [{ role: "user", content: [{ text: prompt }] }];

  const systemBlocks: SystemContentBlock[] | undefined = system
    ? [{ text: system }]
    : undefined;

  const startedAt = Date.now();
  const response = await client.send(
    new ConverseCommand({
      modelId,
      messages,
      system: systemBlocks,
      inferenceConfig: {
        maxTokens: MAX_TOKENS,
        temperature: BEDROCK_TEMPERATURE,
      },
    }),
  );

  const latencyMs = Date.now() - startedAt;
  const text =
    response.output?.message?.content
      ?.map((block) => (typeof block.text === "string" ? block.text : ""))
      .join("") ?? "";

  return {
    text,
    modelId,
    latencyMs,
    stopReason: response.stopReason,
    inputTokens: response.usage?.inputTokens,
    outputTokens: response.usage?.outputTokens,
  };
}
