"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/api-utils";

/**
 * Staged verification experience shown while analysis runs. Each stage maps
 * to a real pipeline step in the backend architecture (claims → entities →
 * evidence retrieval → report), so the wait communicates the process instead
 * of a generic spinner.
 */

const STEPS = [
  { label: "Extracting claims", detail: "Splitting the message into individual, checkable assertions" },
  { label: "Identifying entities", detail: "Isolating companies, people, amounts and contact details" },
  { label: "Evaluating evidence", detail: "Checking each claim against retrieved sources" },
  { label: "Building verification report", detail: "Assigning statuses and preparing next-step guidance" },
] as const;

export function LoadingAnalysis({ minDurationMs = 2000 }: { minDurationMs?: number }) {
  const [current, setCurrent] = useState(0);
  const startTime = useRef<number | null>(null);

  // Advance stages while guaranteeing the sequence runs for a sensible
  // minimum time — communicates the pipeline without artificially delaying
  // the result beyond that.
  useEffect(() => {
    startTime.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - (startTime.current ?? 0);
      if (elapsed < minDurationMs) return;
      setCurrent((c) => Math.min(STEPS.length - 1, c + 1));
    }, 1100);
    return () => clearInterval(interval);
  }, [minDurationMs]);

  return (
    <section aria-busy="true" aria-live="polite" className="animate-fade-up">
      <div className="mx-auto max-w-2xl">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-card)] sm:p-10">
          {/* Scan sweep — a quiet nod to "investigation in progress" */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent"
          />

          <div className="mb-8 flex items-center gap-3.5">
            <span className="animate-pulse-ring grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-card)]">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-space text-xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)]">
                Analyzing with VeriFYI
              </h2>
              <p className="mt-0.5 text-sm text-[var(--ink-500)]">
                Checking what can actually be verified — this takes a few seconds.
              </p>
            </div>
          </div>

          <ol className="space-y-1">
            {STEPS.map((step, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li
                  key={step.label}
                  className={cn(
                    "flex items-start gap-3.5 rounded-xl px-3 py-3 transition-colors",
                    active && "bg-[var(--surface-muted)]",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                      done && "border-[var(--status-supported)] bg-[var(--status-supported)] text-[var(--status-supported-soft)]",
                      active && "border-[var(--accent)] text-[var(--accent)]",
                      !done && !active && "border-[var(--border-strong)] text-transparent",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    ) : active ? (
                      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[15px] font-semibold",
                        done && "text-[var(--ink-500)]",
                        active && "text-[var(--ink-950)]",
                        !done && !active && "text-[var(--ink-300)]",
                      )}
                    >
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[13px] leading-relaxed",
                        active ? "text-[var(--ink-500)]" : "text-[var(--ink-300)]",
                      )}
                    >
                      {step.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-8 border-t border-dashed border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--ink-400)]">
            VeriFYI evaluates each claim against available evidence. Claims without sufficient
            evidence are reported as <strong className="font-semibold">Unverified</strong> — absence
            of evidence is not treated as proof of fraud.
          </p>
        </div>
      </div>
    </section>
  );
}
