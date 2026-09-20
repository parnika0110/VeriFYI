import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { STATUS_META } from "@/lib/status";
import type { ClaimStatus } from "@/lib/types";
import { cn } from "@/lib/api-utils";

/**
 * Status visuals — single place that maps a ClaimStatus to icon + classes.
 * Every status pairs an icon and a text label with its color, so status is
 * never communicated by color alone (accessibility + color-blind safety).
 */

const STATUS_CLASSES: Record<ClaimStatus, { badge: string; icon: string }> = {
  SUPPORTED: {
    badge: "bg-[var(--status-supported-soft)] text-[var(--status-supported)] border-[var(--status-supported-border)]",
    icon: "text-[var(--status-supported)]",
  },
  UNVERIFIED: {
    badge:
      "bg-[var(--status-unverified-soft)] text-[var(--status-unverified)] border-[var(--status-unverified-border)]",
    icon: "text-[var(--status-unverified)]",
  },
  CONTRADICTED: {
    badge:
      "bg-[var(--status-contradicted-soft)] text-[var(--status-contradicted)] border-[var(--status-contradicted-border)]",
    icon: "text-[var(--status-contradicted)]",
  },
};

function StatusIcon({ status, className }: { status: ClaimStatus; className?: string }) {
  const cls = cn("shrink-0", STATUS_CLASSES[status].icon, className);
  if (status === "SUPPORTED") return <CircleCheck aria-hidden="true" className={cn(cls, "fill-current opacity-15")} />;
  if (status === "CONTRADICTED") return <CircleX aria-hidden="true" className={cn(cls, "fill-current opacity-15")} />;
  return <CircleHelp aria-hidden="true" className={cn(cls, "fill-current opacity-15")} />;
}

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: ClaimStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide uppercase",
        STATUS_CLASSES[status].badge,
        size === "sm" && "px-2 py-0.5 text-[11px]",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3.5 py-1.5 text-sm",
        className,
      )}
    >
      <StatusIcon status={status} className={size === "sm" ? "size-3.5" : "size-4"} />
      {meta.label}
      <span className="sr-only"> — {meta.blurb}</span>
    </span>
  );
}

/** Compact status marker for tight spaces (counts, lists). */
export function StatusDot({ status, className }: { status: ClaimStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusIcon status={status} className="size-4" />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Horizontal confidence bar; the % is also always shown as text. */
export function ConfidenceMeter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={`Model confidence in this status: ${pct}%`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-muted)] ring-1 ring-[var(--border)]"
      >
        <span
          className="block h-full rounded-full bg-[var(--ink-500)] transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-xs font-medium tabular-nums text-[var(--ink-500)]">{pct}%</span>
      <span className="sr-only">{`Confidence: ${pct}%`}</span>
    </span>
  );
}
