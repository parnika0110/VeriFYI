/**
 * VeriFYI backend test suite (node:test via tsx, zero test dependencies).
 *
 * Two suites:
 *  1. Offline (default): full pipeline with a MOCKED Bedrock invocation —
 *     exercises prompt -> parse -> validate -> anti-fabrication gates.
 *  2. Live (`npm run test:live`): real Bedrock end-to-end. Requires valid
 *     AWS credentials (`aws login`) and Bedrock model access.
 *
 * Run from the project root (npm run test / npm run test:live).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { analyzeText } from "../lib/analyzer";
import { getProviderName, requireConfiguredProvider } from "../lib/ai";
import {
  validateVerificationResult,
  deriveOverallStatus,
  assertsPaymentRequired,
  isAiInternalEvidence,
} from "../lib/validation";
import { toClientError, AppError } from "../lib/errors";
import { hashInput } from "../lib/logging";
import type { BedrockInvokeResult } from "../lib/bedrock";

/* ------------------------------------------------------------------ */
/* Shared inputs                                                       */
/* ------------------------------------------------------------------ */

export const SUSPICIOUS_INPUT = `Congratulations! You have been selected for an AI internship.
Salary Rs 80,000/month.
Pay Rs 1,500 onboarding fee.
Contact recruiter at googlecareers@gmail.com.`;

export const AMBIGUOUS_INPUT = `We are hiring interns. Apply soon!`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mockInvoke(responseText: string, latencyMs = 5) {
  return async (): Promise<BedrockInvokeResult> => ({
    text: responseText,
    modelId: "test-model",
    latencyMs,
    stopReason: "end_turn",
  });
}

/** A well-formed model response for the suspicious sample. */
const SUSPICIOUS_MODEL_JSON = JSON.stringify({
  overallStatus: "HIGH_RISK",
  summary: "The message requires an upfront payment and its recruiter identity cannot be verified.",
  claims: [
    {
      id: "claim-1",
      claim: "The user has been selected for an AI internship",
      category: "ROLE",
      status: "UNVERIFIED",
      confidence: 0.9,
      explanation: "The message asserts a selection, but no verifiable offer details are provided.",
      evidence: [
        {
          source: "User-provided message",
          type: "USER_PROVIDED",
          description: "The message announces a selection.",
          relevantText: "You have been selected for an AI internship",
        },
      ],
      recommendedAction: "Ask for a formal offer letter on company letterhead.",
    },
    {
      id: "claim-2",
      claim: "The internship pays Rs 80,000 per month",
      category: "SALARY",
      status: "UNVERIFIED",
      confidence: 0.85,
      explanation: "The amount appears only in the message itself; no official source confirms it.",
      evidence: [
        {
          source: "User-provided message",
          type: "USER_PROVIDED",
          description: "The message advertises this salary.",
          relevantText: "Salary Rs 80,000/month",
        },
      ],
      recommendedAction: "Compare with official company salary bands for similar roles.",
    },
    {
      id: "claim-3",
      claim: "The applicant must pay a Rs 1,500 onboarding fee",
      category: "PAYMENT",
      status: "SUPPORTED",
      confidence: 0.95,
      explanation: "The message explicitly requires a payment.",
      evidence: [
        {
          source: "User-provided message",
          type: "USER_PROVIDED",
          description: "The message requests an onboarding fee.",
          relevantText: "Pay Rs 1,500 onboarding fee",
        },
      ],
      recommendedAction: "Do not make any payment until the opportunity is independently verified.",
    },
    {
      id: "claim-4",
      claim: "The recruiter represents Google",
      category: "RECRUITER",
      status: "UNVERIFIED",
      confidence: 0.9,
      explanation: "A gmail.com address does not establish that the sender is an official Google recruiter.",
      evidence: [
        {
          source: "User-provided message",
          type: "USER_PROVIDED",
          description: "The recruiter contact is a gmail.com address.",
          relevantText: "googlecareers@gmail.com",
        },
      ],
      recommendedAction: "Verify the recruiter through the company's official careers website.",
    },
  ],
  recommendedActions: [
    "Verify the opportunity on the company's official careers website.",
    "Do not make any payment before verification.",
  ],
});

/** A response that tries to fabricate evidence from model knowledge. */
const FABRICATED_MODEL_JSON = JSON.stringify({
  overallStatus: "VERIFIED",
  summary: "Everything checks out.",
  claims: [
    {
      id: "claim-1",
      claim: "Google has officially selected the user",
      category: "COMPANY",
      status: "SUPPORTED",
      confidence: 0.99,
      explanation: "Google is a well-known company that hires interns.",
      evidence: [
        {
          source: "AI internal knowledge",
          type: "USER_PROVIDED",
          description: "The model knows Google hires interns.",
        },
      ],
    },
  ],
  recommendedActions: [],
});

/* ------------------------------------------------------------------ */
/* Offline cases                                                       */
/* ------------------------------------------------------------------ */

const CASES: Array<{ name: string; fn: () => void | Promise<void> }> = [
  {
    name: "CASE 1 suspicious: payment SUPPORTED, recruiter UNVERIFIED, HIGH_RISK, no scam language",
    fn: async () => {
      const { result } = await analyzeText(SUSPICIOUS_INPUT, { invoke: mockInvoke(SUSPICIOUS_MODEL_JSON) });
      assert.equal(result.overallStatus, "HIGH_RISK");
      const payment = result.claims.find((c) => c.category === "PAYMENT");
      assert.ok(payment, "payment claim present");
      assert.equal(payment.status, "SUPPORTED");
      assert.equal(payment.evidence[0].type, "USER_PROVIDED");
      const recruiter = result.claims.find((c) => c.category === "RECRUITER");
      assert.ok(recruiter, "recruiter claim present");
      assert.equal(recruiter.status, "UNVERIFIED");
      assert.ok(
        result.recommendedActions.some((a) => a.toLowerCase().includes("payment")),
        "payment safety action present",
      );
      assert.ok(!JSON.stringify(result).toLowerCase().includes("scam"), "never labels a scam");
    },
  },
  {
    name: "CASE 2 fabricated evidence stripped, claim downgraded to UNVERIFIED",
    fn: async () => {
      const { result } = await analyzeText(SUSPICIOUS_INPUT, { invoke: mockInvoke(FABRICATED_MODEL_JSON) });
      assert.equal(result.overallStatus, "NEEDS_VERIFICATION");
      assert.equal(result.claims[0].status, "UNVERIFIED");
      assert.equal(result.claims[0].evidence.length, 0, "AI-internal evidence removed");
    },
  },
  {
    name: "CASE 3 ambiguous input: NEEDS_VERIFICATION",
    fn: async () => {
      const modelJson = JSON.stringify({
        overallStatus: "NEEDS_VERIFICATION",
        summary: "The text is too vague to verify any claim.",
        claims: [
          {
            id: "claim-1",
            claim: "A company is hiring interns",
            category: "OTHER",
            status: "UNVERIFIED",
            confidence: 0.5,
            explanation: "No company, role, or contact details are provided.",
            evidence: [],
            recommendedAction: "Ask the sender for the company name and official application link.",
          },
        ],
        recommendedActions: ["Ask for concrete details before engaging further."],
      });
      const { result } = await analyzeText(AMBIGUOUS_INPUT, { invoke: mockInvoke(modelJson) });
      assert.equal(result.overallStatus, "NEEDS_VERIFICATION");
      assert.ok(result.claims.every((c) => c.status === "UNVERIFIED"));
    },
  },
  {
    name: "CASE 4 model wraps JSON in markdown fences and prose",
    fn: async () => {
      const wrapped = "Here is my analysis:\n```json\n" + SUSPICIOUS_MODEL_JSON + "\n```\nHope this helps!";
      const { result } = await analyzeText(SUSPICIOUS_INPUT, { invoke: mockInvoke(wrapped) });
      assert.equal(result.overallStatus, "HIGH_RISK");
      assert.ok(result.claims.length >= 3);
    },
  },
  {
    name: "CASE 5 malformed JSON retried, second attempt succeeds",
    fn: async () => {
      let calls = 0;
      const invoke = async (): Promise<BedrockInvokeResult> => {
        calls += 1;
        return {
          text: calls === 1 ? "not json at all" : SUSPICIOUS_MODEL_JSON,
          modelId: "test-model",
          latencyMs: 1,
          stopReason: "end_turn",
        };
      };
      const { result, metadata } = await analyzeText(SUSPICIOUS_INPUT, { invoke });
      assert.equal(metadata.attempts, 2);
      assert.equal(result.overallStatus, "HIGH_RISK");
      assert.equal(calls, 2);
    },
  },
  {
    name: "CASE 6 both attempts malformed -> controlled AppError, not a crash",
    fn: async () => {
      await assert.rejects(
        () => analyzeText(SUSPICIOUS_INPUT, { invoke: mockInvoke("}{") }),
        (error: unknown) => error instanceof AppError && error.code === "MODEL_OUTPUT_INVALID",
      );
    },
  },
  {
    name: "CASE 7 validator rejects garbage structures",
    fn: () => {
      assert.equal(validateVerificationResult(null), null);
      assert.equal(validateVerificationResult("nope"), null);
      assert.equal(validateVerificationResult({}), null);
      assert.equal(
        validateVerificationResult({ overallStatus: "HIGH_RISK", summary: "x", claims: "nope" }),
        null,
      );
      assert.equal(
        validateVerificationResult({ overallStatus: "WHATEVER", summary: "x", claims: [] }),
        null,
      );
    },
  },
  {
    name: "CASE 8 empty claims rejected; status enum case-insensitive; confidence clamped",
    fn: () => {
      assert.equal(
        validateVerificationResult({ overallStatus: "HIGH_RISK", summary: "s", claims: [] }),
        null,
      );

      const clamped = validateVerificationResult({
        overallStatus: "NEEDS_VERIFICATION",
        summary: "s",
        claims: [
          {
            id: "c1",
            claim: "claim",
            category: "OTHER",
            status: "unverified",
            confidence: 7,
            explanation: "e",
            evidence: [],
          },
        ],
      });
      assert.ok(clamped);
      assert.equal(clamped.claims[0].status, "UNVERIFIED");
      assert.equal(clamped.claims[0].confidence, 1);
    },
  },
  {
    name: "CASE 9 overall-status coherence incl. payment negation guard",
    fn: () => {
      const mk = (status: string, category = "OTHER", claim = "x") =>
        ({
          status,
          category,
          claim,
          evidence: [{ source: "s", type: "USER_PROVIDED", description: "d" }],
        }) as never;
      assert.equal(deriveOverallStatus([mk("CONTRADICTED")], "NEEDS_VERIFICATION"), "HIGH_RISK");
      assert.equal(
        deriveOverallStatus([mk("SUPPORTED"), mk("UNVERIFIED")], "NEEDS_VERIFICATION"),
        "NEEDS_VERIFICATION",
      );
      assert.equal(deriveOverallStatus([mk("SUPPORTED"), mk("SUPPORTED")], "NEEDS_VERIFICATION"), "VERIFIED");
      assert.equal(
        deriveOverallStatus([mk("SUPPORTED", "PAYMENT", "must pay a fee")], "NEEDS_VERIFICATION"),
        "HIGH_RISK",
      );
      assert.equal(
        deriveOverallStatus([mk("SUPPORTED", "PAYMENT", "no fee is required")], "NEEDS_VERIFICATION"),
        "NEEDS_VERIFICATION",
      );
      assert.equal(assertsPaymentRequired("Pay Rs 1,500 onboarding fee"), true);
      assert.equal(assertsPaymentRequired("Pay \u20b9999 registration fee"), true);
      assert.equal(assertsPaymentRequired("A refundable deposit of Rs 2,000 is required"), true);
      assert.equal(assertsPaymentRequired("No payment is required"), false);
      assert.equal(assertsPaymentRequired("No registration fee is required"), false);
      assert.equal(assertsPaymentRequired("The fee is waived for early applicants"), false);
      assert.equal(assertsPaymentRequired("No fee is charged at any stage"), false);
    },
  },
  {
    name: "CASE 13 fabricated URL evidence is rejected (labeling it USER_PROVIDED is not enough)",
    fn: () => {
      const out = validateVerificationResult(
        {
          overallStatus: "VERIFIED",
          summary: "Company verified.",
          claims: [
            {
              id: "claim-1",
              claim: "The company exists and is official",
              category: "COMPANY",
              status: "SUPPORTED",
              confidence: 0.95,
              explanation: "Verified via official source.",
              evidence: [
                {
                  source: "https://example.com",
                  type: "USER_PROVIDED",
                  description: "Official company verification",
                },
              ],
            },
          ],
          recommendedActions: [],
        },
        SUSPICIOUS_INPUT,
      );
      assert.ok(out);
      assert.equal(out.claims[0].evidence.length, 0, "untraceable evidence dropped");
      assert.equal(out.claims[0].status, "UNVERIFIED", "claim downgraded");
      assert.equal(out.overallStatus, "NEEDS_VERIFICATION");
    },
  },
  {
    name: "CASE 14 quote that does not occur in the submitted text is dropped",
    fn: () => {
      const out = validateVerificationResult(
        {
          overallStatus: "NEEDS_VERIFICATION",
          summary: "s",
          claims: [
            {
              id: "claim-1",
              claim: "The company operates an office in Bengaluru",
              category: "COMPANY",
              status: "SUPPORTED",
              confidence: 0.9,
              explanation: "Quoted.",
              evidence: [
                {
                  source: "User-provided message",
                  type: "USER_PROVIDED",
                  description: "Message mentions office.",
                  relevantText: "Our office is located in HSR Layout, Bengaluru",
                },
              ],
            },
          ],
          recommendedActions: [],
        },
        SUSPICIOUS_INPUT,
      );
      assert.ok(out);
      assert.equal(out.claims[0].evidence.length, 0, "invented quote dropped");
      assert.equal(out.claims[0].status, "UNVERIFIED");
    },
  },
  {
    name: "CASE 15 traceable verbatim quote survives as USER_PROVIDED evidence",
    fn: () => {
      const out = validateVerificationResult(
        {
          overallStatus: "HIGH_RISK",
          summary: "s",
          claims: [
            {
              id: "claim-1",
              claim: "The message requests an onboarding fee",
              category: "PAYMENT",
              status: "SUPPORTED",
              confidence: 0.95,
              explanation: "Quoted.",
              evidence: [
                {
                  source: "User-provided message",
                  type: "USER_PROVIDED",
                  description: "Message requests fee.",
                  relevantText: "Pay Rs 1,500 onboarding fee",
                },
              ],
            },
          ],
          recommendedActions: [],
        },
        SUSPICIOUS_INPUT,
      );
      assert.ok(out);
      assert.equal(out.claims[0].evidence.length, 1, "verbatim quote kept");
      assert.equal(out.claims[0].status, "SUPPORTED");
      assert.equal(out.overallStatus, "HIGH_RISK");
    },
  },
  {
    name: "CASE 16 OFFICIAL/SEARCH evidence is fail-closed while no external subsystem exists",
    fn: () => {
      for (const type of ["OFFICIAL", "SEARCH"] as const) {
        const out = validateVerificationResult(
          {
            overallStatus: "NEEDS_VERIFICATION",
            summary: "s",
            claims: [
              {
                id: "claim-1",
                claim: "The role exists on the official site",
                category: "ROLE",
                status: "SUPPORTED",
                confidence: 0.9,
                explanation: "Found online.",
                evidence: [
                  {
                    source: "Google careers website",
                    type,
                    description: "Official listing found.",
                    relevantText: "Pay Rs 1,500 onboarding fee",
                  },
                ],
              },
            ],
            recommendedActions: [],
          },
          SUSPICIOUS_INPUT,
        );
        assert.ok(out);
        assert.equal(out.claims[0].evidence.length, 0, `${type} evidence dropped`);
        assert.equal(out.claims[0].status, "UNVERIFIED");
      }
    },
  },
  {
    name: "CASE 17 omitting sourceText strips all evidence (fail-closed default)",
    fn: () => {
      const out = validateVerificationResult({
        overallStatus: "NEEDS_VERIFICATION",
        summary: "s",
        claims: [
          {
            id: "claim-1",
            claim: "c",
            category: "OTHER",
            status: "SUPPORTED",
            confidence: 0.9,
            explanation: "e",
            evidence: [
              {
                source: "User-provided message",
                type: "USER_PROVIDED",
                description: "d",
                relevantText: "Pay Rs 1,500 onboarding fee",
              },
            ],
          },
        ],
        recommendedActions: [],
      });
      assert.ok(out);
      assert.equal(out.claims[0].evidence.length, 0, "no sourceText -> no evidence");
      assert.equal(out.claims[0].status, "UNVERIFIED");
    },
  },
  {
    name: "CASE 18 Gemini-shaped raw output parses through the same pipeline",
    fn: async () => {
      // Gemini (responseMimeType: application/json) returns bare JSON; the
      // pipeline must accept it identically to any other provider.
      const geminiStyle = JSON.stringify({
        overallStatus: "HIGH_RISK",
        summary: "Payment requested; identity unverifiable.",
        claims: [
          {
            id: "claim-1",
            claim: "The message requests an onboarding fee",
            category: "PAYMENT",
            status: "SUPPORTED",
            confidence: 0.93,
            explanation: "Verbatim payment request in the text.",
            evidence: [
              {
                source: "User-provided message",
                type: "USER_PROVIDED",
                description: "Payment request quoted verbatim.",
                relevantText: "Pay Rs 1,500 onboarding fee",
              },
            ],
            recommendedAction: "Do not make any payment before verification.",
          },
          {
            id: "claim-2",
            claim: "The recruiter represents Google",
            category: "RECRUITER",
            status: "UNVERIFIED",
            confidence: 0.9,
            explanation: "A gmail address does not establish affiliation.",
            evidence: [
              {
                source: "User-provided message",
                type: "USER_PROVIDED",
                description: "Contact quoted verbatim.",
                relevantText: "Contact recruiter at googlecareers@gmail.com",
              },
            ],
          },
        ],
        recommendedActions: ["Verify via official channels."],
      });
      const { result, metadata } = await analyzeText(SUSPICIOUS_INPUT, {
        invoke: mockInvoke(geminiStyle),
      });
      assert.equal(metadata.provider, "test");
      assert.equal(result.overallStatus, "HIGH_RISK");
      assert.ok(result.claims.length === 2);
    },
  },
  {
    name: "CASE 19 missing Gemini API key -> controlled AppError, no fabricated result",
    fn: async () => {
      const previous = process.env.GEMINI_API_KEY;
      const previousProvider = process.env.AI_PROVIDER;
      delete process.env.GEMINI_API_KEY;
      delete process.env.AI_PROVIDER;
      delete process.env.MOCK_BEDROCK;
      try {
        assert.throws(
          () => requireConfiguredProvider(),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "ANALYSIS_FAILED" &&
            !error.message.includes("GEMINI"),
        );
      } finally {
        if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
        if (previousProvider !== undefined) process.env.AI_PROVIDER = previousProvider;
      }
    },
  },
  {
    name: "CASE 20 provider selection: gemini default, mock + legacy MOCK_BEDROCK compat",
    fn: () => {
      const saved = {
        provider: process.env.AI_PROVIDER,
        mock: process.env.MOCK_BEDROCK,
      };
      try {
        delete process.env.AI_PROVIDER;
        delete process.env.MOCK_BEDROCK;
        assert.equal(getProviderName(), "gemini", "default provider is gemini");

        process.env.AI_PROVIDER = "mock";
        assert.equal(getProviderName(), "mock");

        delete process.env.AI_PROVIDER;
        process.env.MOCK_BEDROCK = "1";
        assert.equal(getProviderName(), "mock", "legacy MOCK_BEDROCK=1 still works");
      } finally {
        if (saved.provider !== undefined) process.env.AI_PROVIDER = saved.provider;
        else delete process.env.AI_PROVIDER;
        if (saved.mock !== undefined) process.env.MOCK_BEDROCK = saved.mock;
        else delete process.env.MOCK_BEDROCK;
      }
    },
  },
  {
    name: "CASE 10 error mapping never leaks internals",
    fn: () => {
      const leak = new Error("AccessDenied: user arn:aws:iam::123456789012:user/x is not authorized");
      const mapped = toClientError(leak);
      assert.equal(mapped.status, 500);
      assert.ok(!mapped.body.error.includes("arn:aws"));
      assert.ok(!mapped.body.error.includes("AccessDenied"));

      const app = new AppError("INPUT_TOO_LARGE", "internal detail", { details: { secret: "x" } });
      const mappedApp = toClientError(app);
      assert.equal(mappedApp.status, 413);
      assert.ok(!JSON.stringify(mappedApp).includes("secret"));
    },
  },
  {
    name: "CASE 11 logging hashes input instead of printing it",
    fn: () => {
      const secret = "my-secret-recruiter-email@example.com";
      const hash = hashInput(secret);
      assert.equal(hash.length, 12);
      assert.ok(!hash.includes("secret"));
      assert.notEqual(hash, secret);
    },
  },
  {
    name: "CASE 12 AI-internal sentinel detection variants",
    fn: () => {
      assert.equal(isAiInternalEvidence("AI internal knowledge", "USER_PROVIDED"), true);
      assert.equal(isAiInternalEvidence("AI internal knowledge", "SEARCH"), true);
      assert.equal(isAiInternalEvidence("AI internal knowledge: UPI handles are common", "SEARCH"), true);
      assert.equal(isAiInternalEvidence("User-provided message", "USER_PROVIDED"), false);
    },
  },
];

async function runOfflineCases(): Promise<{ failures: number; total: number }> {
  let failures = 0;
  for (const testCase of CASES) {
    try {
      await test(testCase.name, { timeout: 10_000 }, testCase.fn);
      console.log(`PASS: ${testCase.name}`);
    } catch {
      failures += 1;
      console.error(`FAIL: ${testCase.name}`);
    }
  }
  return { failures, total: CASES.length };
}

/* ------------------------------------------------------------------ */
/* Live Bedrock suite (opt-in: npm run test:live)                      */
/* ------------------------------------------------------------------ */

async function runLiveCases(): Promise<number> {
  let failures = 0;
  try {
  await test("LIVE 1 suspicious text end-to-end via Bedrock", { timeout: 120_000 }, async () => {
    const { result, metadata } = await analyzeText(SUSPICIOUS_INPUT);
    console.log(`[live] model=${metadata.modelId} latency=${metadata.latencyMs}ms attempts=${metadata.attempts}`);
    console.log(`[live] overall=${result.overallStatus} claims=${result.claims.length}`);
    assert.equal(result.overallStatus, "HIGH_RISK");
    const payment = result.claims.find((c) => c.category === "PAYMENT");
    assert.ok(payment, "payment claim present");
    assert.equal(payment.status, "SUPPORTED");
    assert.ok(
      result.recommendedActions.some((a) => a.toLowerCase().includes("payment")),
      "payment safety action present",
    );
    const recruiter = result.claims.find((c) => c.category === "RECRUITER");
    assert.ok(recruiter, "recruiter claim present");
    assert.equal(recruiter.status, "UNVERIFIED", "gmail recruiter must stay UNVERIFIED");
    for (const claim of result.claims) {
      if (claim.status !== "UNVERIFIED") {
        assert.ok(claim.evidence.length > 0, `${claim.id} carries evidence`);
        for (const evidence of claim.evidence) {
          assert.ok(
            !evidence.source.toLowerCase().includes("ai internal"),
            `${claim.id} evidence is not AI-internal`,
          );
        }
      }
    }
  });
  } catch { failures += 1; }

  try {
  await test("LIVE 2 legitimate-looking description is not called HIGH_RISK", { timeout: 120_000 }, async () => {
    const legitimate = `About the internship: We are looking for a React Native developer intern to join our product team.
Selected intern's day-to-day responsibilities include building and shipping features, participating in code reviews, and collaborating with designers.
Stipend: Rs 15,000 per month. Duration: 6 months. Apply via our careers page with your resume.
This is a full-time, office-based internship in Bengaluru.`;
    const { result } = await analyzeText(legitimate);
    console.log(`[live] overall=${result.overallStatus} claims=${result.claims.length}`);
    assert.notEqual(result.overallStatus, "HIGH_RISK", "legit description must not be HIGH_RISK");
    assert.ok(result.claims.length >= 3, "several claims extracted");
    const salary = result.claims.find((c) => c.category === "SALARY");
    assert.ok(salary, "salary claim present");
    assert.equal(salary.status, "UNVERIFIED", "advertised stipend is not confirmed money");
  });
  } catch { failures += 1; }

  try {
  await test("LIVE 3 ambiguous text -> NEEDS_VERIFICATION", { timeout: 120_000 }, async () => {
    const { result } = await analyzeText(AMBIGUOUS_INPUT);
    console.log(`[live] overall=${result.overallStatus}`);
    assert.equal(result.overallStatus, "NEEDS_VERIFICATION");
    assert.ok(result.claims.length >= 1);
  });
  } catch { failures += 1; }
  return failures;
}

/* ------------------------------------------------------------------ */
/* Contract guard: the whole project (lib, app, tests) must typecheck  */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const offline = await runOfflineCases();
  let failures = offline.failures;
  let total = offline.total;
  if (process.argv.includes("--live")) {
    failures += await runLiveCases();
    total += 3;
  }

  if (!process.env.SKIP_TYPECHECK) {
    const tsc = spawnSync(
      process.execPath,
      [join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
      { encoding: "utf8" },
    );
    if (tsc.status !== 0) {
      console.error(`typecheck failed:\n${tsc.stdout}\n${tsc.stderr}`);
      failures += 1;
    }
  }

  console.log(`\nRESULT: ${total - failures}/${total} cases passed, typecheck guard ${failures > 0 ? "FAILED" : "OK"}`);
  process.exit(failures > 0 ? 1 : 0);
}

void main();
