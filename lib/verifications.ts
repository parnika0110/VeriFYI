/**
 * DynamoDB persistence for verification history.
 *
 * Design:
 *  - best-effort only: /api/analyze must never fail because persistence did
 *  - pay-per-request billing (suitable for a hackathon demo)
 *  - we store the structured result only — no raw user input, no contact
 *    details beyond what the model chose to quote inside the result
 *
 * Table (created by infrastructure/template.yaml):
 *   VeriFYIVerifications: pk=id, gs1: overallStatus + createdAt
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import type { StoredVerification, VerificationResult } from "./contract";
import { log } from "./logging";
import { serverEnv } from "./server-env";

let cachedDocClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!cachedDocClient) {
    const client = new DynamoDBClient({ region: serverEnv("AWS_REGION") || "ap-southeast-1" });
    cachedDocClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cachedDocClient;
}

/** True when DynamoDB history is usable in this environment. */
export function isDynamoDbConfigured(): boolean {
  return Boolean(serverEnv("VERIFICATIONS_TABLE_NAME"));
}

/** Persist a verification result. Returns the stored record, or null when disabled/failed. */
export async function saveVerification(
  result: VerificationResult,
): Promise<StoredVerification | null> {
  if (!isDynamoDbConfigured()) return null;

  const record: StoredVerification = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    overallStatus: result.overallStatus,
    summary: result.summary,
    claimCount: result.claims.length,
    result,
  };

  const startedAt = Date.now();
  const tableName = serverEnv("VERIFICATIONS_TABLE_NAME");
  await getDocClient().send(
    new PutCommand({
      TableName: tableName,
      Item: { ...record, gsi1pk: "VERIFICATION" },
    }),
  );
  log.info("verification_saved", { id: record.id, latencyMs: Date.now() - startedAt });
  return record;
}

/** Most recent verifications, newest first. */
export async function listVerifications(limit = 20): Promise<StoredVerification[]> {
  if (!isDynamoDbConfigured()) return [];
  const capped = Math.min(Math.max(limit, 1), 50);

  const response = await getDocClient().send(
    new QueryCommand({
      TableName: serverEnv("VERIFICATIONS_TABLE_NAME"),
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": "VERIFICATION" },
      ScanIndexForward: false,
      Limit: capped,
    }),
  );
  return (response.Items ?? []) as unknown as StoredVerification[];
}

/** Count of verifications per overall status (demo/metrics helper). */
export async function countVerificationsByStatus(): Promise<Record<string, number>> {
  if (!isDynamoDbConfigured()) return {};
  const response = await getDocClient().send(
    new ScanCommand({
      TableName: serverEnv("VERIFICATIONS_TABLE_NAME"),
      ProjectionExpression: "#s",
      ExpressionAttributeNames: { "#s": "overallStatus" },
    }),
  );
  const counts: Record<string, number> = {};
  for (const item of response.Items ?? []) {
    const status = String(item.overallStatus ?? "UNKNOWN");
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
