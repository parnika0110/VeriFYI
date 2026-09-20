"use client";

import { useState } from "react";
import { Check, Copy, FileSearch, RotateCcw } from "lucide-react";
import type { AnalysisReport, OverallStatus } from "@/lib/types";
import { OVERALL_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/api-utils";
import { StatusDot } from "./status";
import { ClaimCard } from "./ClaimCard";
import { ActionChecklist } from "./ActionChecklist";

const OVERALL_CLASSES: Record<OverallStatus, string> = {
  ALL_SUPPORTED:
    "bg-[var(--status-supported-soft)] text-[var(--status-supported)] border-[var(--status-supported-border)]",
  PARTIALLY_VERIFIED:
    "bg-[var(--accent-soft)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  NEEDS_VERIFICATION:
    "bg-[var(--status-unverified-soft)] text-[var(--status-unverified)] border-[var(--status-unverified-border)]",
  HIGH_RISK:
    "bg-[var(--status-contradicted-soft)] text-[var(--status-contradicted)] border-[var(--status-contradicted-border)]",
  NO_CLAIMS: "bg-[var(--surface-muted)] text-[var(--ink-500)] border-[var(--border)]",
};

function CopyJsonButton({ report }: { report: AnalysisReport }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard unavailable (permissions/insecure context) — no-op */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--ink-950)]"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-[var(--status-supported)]" aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" /> Copy JSON
        </>
      )}
    </button>
  );
}

/**
 * The verification report — a typographic detail page, not a dashboard.
 * The verdict is a statement; the counts are big numerals on a quiet stat
 * line. Claims follow as the content of the page.
 */
export function VerificationReport({
  report,
  onNewAnalysis,
}: {
  report: AnalysisReport;
  onNewAnalysis: () => void;
}) {
  const counts = { SUPPORTED: 0, UNVERIFIED: 0, CONTRADICTED: 0 };
  for (const claim of report.claims) counts[claim.status] += 1;

  const overallMeta = OVERALL_STATUS_META[report.overallStatus];
  const total = report.claims.length;

  return (
    <section aria-label="Verification report" className="animate-fade-up space-y-10">
      {/* ------------------------------ Header ------------------------------ */}
      <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
            <FileSearch className="size-3.5" aria-hidden="true" />
            Analysis complete
          </p>
          <h2 className="font-space mt-2 text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-[var(--ink-950)] sm:text-4xl">
            Verification Report
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopyJsonButton report={report} />
          <button
            type="button"
            onClick={onNewAnalysis}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-semibold text-[var(--ink-700)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            New analysis
          </button>
        </div>
      </div>

      {/* --------------------------- Verdict panel --------------------------- */}
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-widest",
            OVERALL_CLASSES[report.overallStatus],
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {overallMeta.label}
        </span>

        <p className="font-space mt-4 max-w-2xl text-pretty text-xl font-semibold leading-[1.3] tracking-[-0.02em] text-[var(--ink-950)] sm:text-[1.35rem]">
          “{report.summary}”
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-500)]">
          {overallMeta.blurb} VeriFYI reports what the evidence shows — it does not declare
          anything a scam. The judgment of what to do next is yours.
        </p>

        {/* Stat line — typography, not metric cards */}
        <dl className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-[var(--border)] pt-6">
          {(
            [
              { label: "Claims", value: total, status: null as null },
              { label: "Supported", value: counts.SUPPORTED, status: "SUPPORTED" as const },
              { label: "Unverified", value: counts.UNVERIFIED, status: "UNVERIFIED" as const },
              { label: "Contradicted", value: counts.CONTRADICTED, status: "CONTRADICTED" as const },
            ]
          ).map((stat) => (
            <div key={stat.label}>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-500)]">
                {stat.status && <StatusDot status={stat.status} />}
                {stat.label}
              </dt>
              <dd
                className={cn(
                  "font-space mt-0.5 text-4xl font-bold tabular-nums leading-none tracking-[-0.03em]",
                  stat.status === null && "text-[var(--ink-950)]",
                  stat.status === "SUPPORTED" && "text-[var(--status-supported)]",
                  stat.status === "UNVERIFIED" && "text-[var(--status-unverified)]",
                  stat.status === "CONTRADICTED" && "text-[var(--status-contradicted)]",
                )}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ----------------------------- Claims ------------------------------- */}
      <div className="mx-auto max-w-3xl">
        <h3 className="mb-4 flex items-center gap-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          {total} extracted claim{total === 1 ? "" : "s"}
          <span className="h-px flex-1 bg-[var(--border)]" />
        </h3>
        <ol className="space-y-4">
          {report.claims.map((claim, index) => (
            <ClaimCard key={claim.id} claim={claim} index={index} />
          ))}
        </ol>
      </div>

      {/* ------------------------- Action checklist -------------------------- */}
      <div className="mx-auto max-w-3xl">
        <ActionChecklist claims={report.claims} />
      </div>
    </section>
  );
}
