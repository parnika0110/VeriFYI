"use client";

import { useCallback, useState } from "react";
import { Navbar, ClaimTicker } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Analyzer } from "@/components/Analyzer";
import { LoadingAnalysis } from "@/components/LoadingAnalysis";
import { VerificationReport } from "@/components/VerificationReport";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { HowItWorks } from "@/components/HowItWorks";
import { WhyNotJustAI } from "@/components/WhyNotJustAI";
import { Footer } from "@/components/Footer";
import { analyzeClaim } from "@/lib/api";
import { VerifyiError } from "@/lib/types";
import type { AnalysisReport, AppPhase } from "@/lib/types";
import type { UploadedFile } from "@/components/FileUpload";

/**
 * VeriFYI single-page experience.
 *
 * Flow: Paste → Verify → Understand → Act.
 * State machine: input → analyzing → report (or error), with scroll
 * management so each transition lands the user on the right section.
 * All data flow goes through lib/api — no fetch calls in components.
 */
export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("input");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastInput, setLastInput] = useState<string>("");

  const scrollToAnalyzer = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      document.getElementById("analyzer")?.scrollIntoView({ behavior, block: "start" });
    });
  }, []);

  const runAnalysis = useCallback(
    async (text: string, file: UploadedFile | null) => {
      // A document's extracted text IS the source text — same pipeline as
      // pasted input. If extraction produced nothing, refuse honestly.
      const inputText = text.trim() || (file?.extractedText ?? "").trim();
      if (!inputText && file) {
        setError("The document contained no readable text to analyze.");
        return;
      }
      if (!inputText) {
        setError(new VerifyiError("empty-input", "Paste a message to analyze first."));
        setPhase("input");
        return;
      }

      setLastInput(inputText);
      setError(null);
      setPhase("analyzing");
      // Land the user on the loading experience.
      requestAnimationFrame(() => {
        document.getElementById("analysis-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      try {
        const result = await analyzeClaim({ text: inputText });
        setReport(result);
        setPhase("report");
        requestAnimationFrame(() => {
          document.getElementById("analysis-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch (err) {
        setError(err);
        setPhase("input");
        requestAnimationFrame(() => {
          document.getElementById("analysis-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
    [],
  );

  const startOver = useCallback(() => {
    setPhase("input");
    setReport(null);
    setError(null);
    scrollToAnalyzer();
  }, [scrollToAnalyzer]);

  const retry = useCallback(() => {
    if (lastInput) void runAnalysis(lastInput, null);
    else startOver();
  }, [lastInput, runAnalysis, startOver]);

  const showLanding = phase === "input" && error === null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {showLanding && (
          <>
            <Hero />
            <ClaimTicker />
            <div className="py-14 sm:py-16">
              <Analyzer onAnalyze={(input) => void runAnalysis(input.text, input.file)} busy={false} />
            </div>
            <HowItWorks />
            <WhyNotJustAI />
          </>
        )}

        {phase === "input" && error !== null && (
          <div className="mx-auto w-full max-w-5xl px-4 pt-16 sm:px-6">
            {error instanceof VerifyiError && error.kind === "empty-input" ? (
              <EmptyState />
            ) : (
              <ErrorState error={error} onRetry={retry} onStartOver={startOver} />
            )}
            <div className="mt-12">
              <Analyzer onAnalyze={(input) => void runAnalysis(input.text, input.file)} busy={false} />
            </div>
          </div>
        )}

        {phase === "analyzing" && (
          <div id="analysis-stage" className="px-4 pt-16 sm:px-6">
            <LoadingAnalysis />
          </div>
        )}

        {phase === "report" && report && (
          <div id="analysis-stage" className="mx-auto w-full max-w-5xl px-4 pt-12 sm:px-6">
            <VerificationReport report={report} onNewAnalysis={startOver} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
