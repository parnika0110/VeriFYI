/**
 * Bedrock provider — preserved unchanged from the original implementation
 * (lib/bedrock.ts). Bedrock remains a supported future provider; it is not
 * the active default while the AWS account has an account-level Bedrock
 * authorization restriction. Select with AI_PROVIDER=bedrock.
 */

export { invokeBedrockText, isBedrockConfigured, getBedrockConfig, DEFAULT_MODEL_ID } from "../bedrock";
