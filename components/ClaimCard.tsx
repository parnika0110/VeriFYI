"use client";

import { useId, useState } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import type { Claim } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_TINTS } from "@/lib/status";
import { cn } from "@/lib/api-utils";
import { StatusBadge, ConfidenceMeter } from "./status";
import { EvidencePanel } from "./EvidencePanel";

/**
 * Claim card — the opportunity-card of VeriFYI. Numbered like a dossier,
 * pastel category chip, status + confidence on a quiet meta line, and a
 * "View details" affordance that expands the WHY/EVIDENCE detail.
 */

/** Left border accent per status — pairs with the badge, never alone. */
const ACCENT_CLASS: Record<Claim["status"], string> = {
  SUPPORTED: "before:bg-[var(--status-supported)]",
  UNVERIFIED: "before:bg-[var(--status-unverified)]",
  CONTRADICTED: "before:bg-[var(--status-contradicted)]",
};

export function ClaimCard({ claim, index }: { claim: Claim; index: number }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const buttonId = useId();
  const num = String(index + 1).padStart(2, "0");
  const tint = CATEGORY_TINTS[claim.category];

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        "transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        ACCENT_CLASS[claim.status],
      )}
    >
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="block w-full p-5 text-left transition-colors duration-200 sm:p-6"
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-sm font-semibold leading-none text-[var(--accent)] opacity-60">
            {num}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.03em]", tint.chip)}>
            {CATEGORY_LABELS[claim.category].toUpperCase()}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-400)]">
            {open ? "Hide details" : "View details"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
            />
          </span>
        </span>

        <span className="font-space mt-3 block text-pretty text-lg font-semibold leading-[1.25] tracking-[-0.01em] text-[var(--ink-950)] sm:text-xl">
          “{claim.claim}”
        </span>

        <span className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusBadge status={claim.status} />
          <ConfidenceMeter value={claim.confidence} />
          <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-400)]">
            <Paperclip className="size-3.5" aria-hidden="true" />
            {claim.evidence.length > 0
              ? `${claim.evidence.length} evidence item${claim.evidence.length === 1 ? "" : "s"}`
              : "No evidence"}
          </span>
        </span>
      </button>

      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-dashed border-[var(--border)]"
      >
        <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-2">
          {/* Explanation — AI's reasoning. Clearly labeled as such. */}
          <div>
            <h4 className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
              Why this status? · AI explanation
            </h4>
            <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--ink-700)]">
              {claim.explanation}
            </p>

            {claim.actions.length > 0 && (
              <div className="mt-5">
                <h4 className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
                  What you can do
                </h4>
                <ul className="mt-2.5 space-y-2">
                  {claim.actions.map((action) => (
                    <li key={action} className="flex items-start gap-2 text-sm text-[var(--ink-700)]">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                      />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Evidence — distinct visual treatment from the explanation. */}
          <EvidencePanel evidence={claim.evidence} status={claim.status} />
        </div>
      </div>
    </li>
  );
}
