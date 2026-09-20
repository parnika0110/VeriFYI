"use client";

import { CloudOff, FileWarning, RefreshCw, RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import { VerifyiError } from "@/lib/types";

/**
 * Error presentation. The user sees a calm explanation and clear actions —
 * never raw errors, stack traces, or status codes.
 */

const ERROR_META = {
  network: {
    icon: CloudOff,
    title: "Connection problem",
    detail: "VeriFYI couldn't reach the analysis service. Please check your connection and try again.",
  },
  api: {
    icon: TriangleAlert,
    title: "VeriFYI couldn't complete the analysis",
    detail: "The analysis service reported a problem. Please try again in a moment.",
  },
  "invalid-response": {
    icon: SearchX,
    title: "Unexpected response",
    detail: "The analysis returned something VeriFYI couldn't interpret. Retrying usually fixes this.",
  },
  "empty-input": {
    icon: FileWarning,
    title: "Nothing to analyze",
    detail: "Paste or upload a claim first, then press Analyze.",
  },
  file: {
    icon: FileWarning,
    title: "File problem",
    detail: "That file couldn't be processed. Please try a PNG, JPG or PDF under 10 MB.",
  },
  unknown: {
    icon: TriangleAlert,
    title: "Something went wrong",
    detail: "An unexpected problem stopped the analysis. Please try again.",
  },
} as const;

export function ErrorState({
  error,
  onRetry,
  onStartOver,
}: {
  error: unknown;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  const kind = error instanceof VerifyiError ? error.kind : "unknown";
  const meta = ERROR_META[kind] ?? ERROR_META.unknown;
  const Icon = meta.icon;

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="mx-auto max-w-xl animate-fade-up"
    >
      <div className="rounded-2xl border border-[var(--status-contradicted-border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-card)] sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--status-contradicted-border)] bg-[var(--status-contradicted-soft)] text-[var(--status-contradicted)]">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <h2 className="font-space mt-5 text-xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)] sm:text-2xl">
          {meta.title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-[var(--ink-500)]">
          {meta.detail}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--ink-950)] px-6 text-sm font-semibold text-[var(--surface)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--ink-700)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Start over
          </button>
        </div>
      </div>
    </section>
  );
}
