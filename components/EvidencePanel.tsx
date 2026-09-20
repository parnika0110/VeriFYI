"use client";

import { ExternalLink, FileText, Globe, Quote, User } from "lucide-react";
import type { ClaimStatus, EvidenceItem, EvidenceSource } from "@/lib/types";
import { cn } from "@/lib/api-utils";

/**
 * Evidence inspection. The panel enforces the product's most important rule:
 * user-provided text is NEVER styled as external verification. Each artifact
 * is labeled by origin and shows whether it supports or contradicts the claim.
 */

const ORIGIN_META: Record<
  EvidenceSource,
  { label: string; icon: typeof Globe; className: string }
> = {
  USER_INPUT: {
    label: "Your input",
    icon: User,
    className: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink-500)]",
  },
  WEB: {
    label: "External evidence",
    icon: Globe,
    className: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]",
  },
  DOCUMENT: {
    label: "Document",
    icon: FileText,
    className: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]",
  },
  AI_EXPLANATION: {
    label: "AI explanation",
    icon: Quote,
    className: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink-400)]",
  },
};

const STANCE_STYLES: Record<EvidenceItem["stance"], string> = {
  SUPPORTS:
    "border-[var(--status-supported-border)] bg-[var(--status-supported-soft)] text-[var(--status-supported)]",
  CONTRADICTS:
    "border-[var(--status-contradicted-border)] bg-[var(--status-contradicted-soft)] text-[var(--status-contradicted)]",
  NEUTRAL: "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-500)]",
};

const STANCE_LABELS: Record<EvidenceItem["stance"], string> = {
  SUPPORTS: "Supports",
  CONTRADICTS: "Contradicts",
  NEUTRAL: "Reference",
};

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const OriginIcon = ORIGIN_META[item.origin].icon;
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 transition-colors duration-200">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            ORIGIN_META[item.origin].className,
          )}
        >
          <OriginIcon className="size-3" aria-hidden="true" />
          {ORIGIN_META[item.origin].label}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            STANCE_STYLES[item.stance],
          )}
        >
          {STANCE_LABELS[item.stance]}
        </span>
        <span
          className="ml-auto max-w-[40%] truncate font-mono text-[11px] font-medium text-[var(--ink-400)]"
          title={item.source}
        >
          {item.source}
        </span>
      </div>

      <blockquote className="mt-3 border-l-2 border-[var(--border-strong)] pl-3 text-sm leading-relaxed text-[var(--ink-700)]">
        {item.excerpt}
      </blockquote>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open source
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </article>
  );
}

export function EvidencePanel({
  evidence,
  status,
}: {
  evidence: EvidenceItem[];
  status: ClaimStatus;
}) {
  return (
    <div>
      <h4 className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
        Evidence · {evidence.length} artifact{evidence.length === 1 ? "" : "s"}
      </h4>

      {evidence.length === 0 ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/50 p-4">
          <p className="text-sm font-semibold text-[var(--ink-700)]">No evidence found.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-500)]">
            {status === "UNVERIFIED"
              ? "Nothing was found to confirm or refute this claim — it stays unverified, which is not the same as false."
              : "VeriFYI did not attach artifacts for this claim. Lack of attached evidence is not proof either way."}
          </p>
        </div>
      ) : (
        <ul className="mt-2.5 space-y-3">
          {evidence.map((item, i) => (
            <li key={`${item.source}-${i}`}>
              <EvidenceCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
