/**
 * Mock provider (dev/demo only).
 *
 * Active when AI_PROVIDER=mock, or via the legacy MOCK_BEDROCK=1 flag which
 * is kept for backward compatibility. Never active in production (the
 * deployed environment does not define these variables).
 *
 * The mock is honest by construction: it builds its evidence from verbatim
 * sentences of the submitted text, so everything it returns passes the same
 * anti-fabrication traceability checks as real model output.
 */

import type { AiInvokeResult } from "./types";

export function isMockProviderRequested(): boolean {
  if (process.env.AI_PROVIDER?.trim().toLowerCase() === "mock") return true;
  // Legacy flag — preserved so existing dev setups keep working.
  return process.env.MOCK_BEDROCK === "1";
}

interface Cue {
  keywords: RegExp;
  category: "ROLE" | "SALARY" | "RECRUITER" | "PAYMENT" | "CONTACT" | "OTHER";
}

const CUES: Cue[] = [
  { keywords: /\b(pay|fee|fees|deposit|registration|onboarding)\b/i, category: "PAYMENT" },
  { keywords: /\b(salary|stipend|paid|per month|\/month|lpa|ctc)\b/i, category: "SALARY" },
  { keywords: /@|\bwhatsapp\b|\btelegram\b|\bcall\b|\bphone\b/i, category: "RECRUITER" },
  { keywords: /\b(selected|hired|offer|intern|internship|job|role|position)\b/i, category: "ROLE" },
];

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function truncateQuote(value: string, max = 200): string {
  return value.length > max ? value.slice(0, max) : value;
}

export async function invokeMockText(
  prompt: string,
  _system?: string,
): Promise<AiInvokeResult> {
  // Recover the submitted text from the analyzer prompt's data fence.
  const match = prompt.match(/<<<TEXT\n([\s\S]*?)\nTEXT>>>/);
  const submitted = match?.[1] ?? "";
  const sentences = sentencesOf(submitted);

  const used = new Set<string>();
  const pick = (cue: Cue): string | null => {
    const hit = sentences.find((s) => cue.keywords.test(s) && !used.has(s));
    if (hit) used.add(hit);
    return hit ?? null;
  };

  const evidenceFor = (quote: string) => [
    {
      source: "User-provided message",
      type: "USER_PROVIDED",
      description: "Verbatim quote from the submitted text.",
      relevantText: truncateQuote(quote),
    },
  ];

  const paymentQuote = pick(CUES[0]);
  const salaryQuote = pick(CUES[1]);
  const recruiterQuote = pick(CUES[2]);
  const roleQuote = pick(CUES[3]);
  const fallbackQuote = sentences.find((s) => !used.has(s)) ?? sentences[0] ?? "";

  const claims: Array<Record<string, unknown>> = [];
  let index = 0;
  const add = (
    claim: string,
    category: string,
    status: "SUPPORTED" | "UNVERIFIED",
    confidence: number,
    explanation: string,
    quote: string | null,
    recommendedAction?: string,
  ) => {
    if (!quote) return;
    index += 1;
    claims.push({
      id: `claim-${index}`,
      claim,
      category,
      status,
      confidence,
      explanation,
      evidence: evidenceFor(quote),
      ...(recommendedAction ? { recommendedAction } : {}),
    });
  };

  add(
    "The message requests an upfront payment",
    "PAYMENT",
    "SUPPORTED",
    0.95,
    "The submitted text explicitly contains a payment request (mock analysis).",
    paymentQuote,
    "Do not make any payment until the opportunity is independently verified.",
  );
  add(
    "The advertised compensation is real",
    "SALARY",
    "UNVERIFIED",
    0.85,
    "The amount appears only in the submitted text; no external source confirms it (mock analysis).",
    salaryQuote,
    "Compare with official company salary bands for similar roles.",
  );
  add(
    "The sender is an official recruiter of the claimed company",
    "RECRUITER",
    "UNVERIFIED",
    0.9,
    "Contact details in the message do not establish an official company affiliation (mock analysis).",
    recruiterQuote,
    "Verify the recruiter through the company's official careers website.",
  );
  add(
    "The recipient has been selected for the stated opportunity",
    "ROLE",
    "UNVERIFIED",
    0.85,
    "The submitted text asserts a selection, but nothing corroborates it (mock analysis).",
    roleQuote,
    "Ask for a formal offer letter on company letterhead.",
  );

  if (claims.length === 0 && fallbackQuote) {
    index += 1;
    claims.push({
      id: `claim-${index}`,
      claim: "The text describes an opportunity",
      category: "OTHER",
      status: "UNVERIFIED" as const,
      confidence: 0.5,
      explanation: "Not enough information to verify any specific claim (mock analysis).",
      evidence: evidenceFor(truncateQuote(fallbackQuote)),
      recommendedAction: "Ask the sender for concrete, verifiable details.",
    });
  }

  const overallStatus = paymentQuote ? "HIGH_RISK" : "NEEDS_VERIFICATION";
  const recommendedActions = [
    ...(paymentQuote ? ["Do not make any payment before verification."] : []),
    "Verify the opportunity on the company's official careers website.",
  ];

  const payload = {
    overallStatus,
    summary: paymentQuote
      ? "The message includes a payment request; other claims could not be verified (mock analysis)."
      : "Claims could not be independently verified from the submitted text alone (mock analysis).",
    claims,
    recommendedActions,
  };

  return {
    text: JSON.stringify(payload),
    modelId: "mock",
    latencyMs: 1,
    stopReason: "end_turn",
  };
}
