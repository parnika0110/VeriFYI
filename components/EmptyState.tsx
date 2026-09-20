"use client";

import { ScanSearch } from "lucide-react";

/**
 * Empty state — shown when there is nothing to analyze. Gentle nudge back to
 * the primary action and the samples.
 */
export function EmptyState() {
  return (
    <section className="mx-auto max-w-xl animate-fade-up text-center">
      <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent)]">
          <ScanSearch className="size-7" aria-hidden="true" />
        </span>
        <h2 className="font-space mt-5 text-xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)]">
          Nothing to analyze yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-[var(--ink-500)]">
          Paste a message you&apos;d like investigated — or try one of the sample claims to see how
          evidence-first verification works.
        </p>
      </div>
    </section>
  );
}
