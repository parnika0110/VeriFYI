"use client";

import { useMemo, useState } from "react";
import { CircleCheck, ListChecks } from "lucide-react";
import type { Claim } from "@/lib/types";
import { CATEGORY_ACTION_HINTS } from "@/lib/status";
import { cn } from "@/lib/api-utils";

/**
 * Report-level action checklist ("What should you do next?"). Actions derive
 * from the actual statuses in the report — prioritized CONTRADICTED first,
 * then UNVERIFIED — and never claim certainty the evidence doesn't support.
 */

interface ActionItem {
  key: string;
  text: string;
  tone: "urgent" | "check" | "safe";
  hint: string;
}

function buildActions(claims: Claim[]): ActionItem[] {
  const items: ActionItem[] = [];
  const seen = new Set<string>();

  const push = (text: string, tone: ActionItem["tone"], hint: string) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ key, text, tone, hint });
  };

  // 1. Any payment request that is contradicted or unverified → stop payment.
  if (claims.some((c) => c.category === "PAYMENT" && c.status !== "SUPPORTED")) {
    push(
      "Avoid sending payment before verification",
      "urgent",
      "Legitimate employers never ask candidates to pay at any hiring stage.",
    );
  }

  // 2. Contradicted claims → their per-claim actions, flagged urgent.
  for (const claim of claims.filter((c) => c.status === "CONTRADICTED")) {
    for (const action of claim.actions) push(action, "urgent", claim.claim);
  }

  // 3. Unverified claims → verification steps for their categories.
  const unverifiedCategories = new Set(
    claims.filter((c) => c.status === "UNVERIFIED").map((c) => c.category),
  );
  for (const category of unverifiedCategories) {
    push(CATEGORY_ACTION_HINTS[category], "check", "This claim could not be verified.");
  }

  // 4. Always-on safety guidance, shown when relevant or as final reminders.
  if (claims.some((c) => c.category === "RECRUITER" && c.status !== "SUPPORTED")) {
    push(
      "Do not share sensitive documents until the request is verified",
      "safe",
      "IDs, bank details and OTPs should never leave your hands unverified.",
    );
  }
  if (claims.every((c) => c.status !== "CONTRADICTED") && claims.length > 0) {
    push(
      "Keep records of the original message and any attachments",
      "safe",
      "Useful if you need to report this later.",
    );
  }

  return items.slice(0, 6);
}

const TONE_META: Record<ActionItem["tone"], { badge: string; label: string }> = {
  urgent: {
    badge:
      "border-[var(--status-contradicted-border)] bg-[var(--status-contradicted-soft)] text-[var(--status-contradicted)]",
    label: "Important",
  },
  check: {
    badge:
      "border-[var(--status-unverified-border)] bg-[var(--status-unverified-soft)] text-[var(--status-unverified)]",
    label: "Verify",
  },
  safe: {
    badge: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink-500)]",
    label: "Good practice",
  },
};

export function ActionChecklist({ claims }: { claims: Claim[] }) {
  const actions = useMemo(() => buildActions(claims), [claims]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  if (actions.length === 0) return null;

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section
      aria-labelledby="action-checklist-heading"
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8"
    >
      <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
        <ListChecks className="mr-1.5 inline size-3.5 text-[var(--accent)]" aria-hidden="true" />
        After the investigation
      </p>
      <h3
        id="action-checklist-heading"
        className="font-space mt-2 text-xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)] sm:text-2xl"
      >
        What should you do next?
      </h3>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {actions.map((action) => {
          const isChecked = checked.has(action.key);
          const tone = TONE_META[action.tone];
          return (
            <li key={action.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                onClick={() => toggle(action.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                  isChecked
                    ? "border-[var(--status-supported-border)] bg-[var(--status-supported-soft)]/60"
                    : "border-[var(--border)] bg-[var(--background)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-200",
                    isChecked
                      ? "border-[var(--status-supported)] bg-[var(--status-supported)] text-[var(--status-supported-soft)]"
                      : "border-[var(--border-strong)] bg-[var(--surface)]",
                  )}
                >
                  {isChecked && <CircleCheck className="size-3.5" strokeWidth={2.5} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-medium text-[var(--ink-950)]",
                      isChecked && "line-through decoration-[var(--ink-300)]",
                    )}
                  >
                    {action.text}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
                        tone.badge,
                      )}
                    >
                      {tone.label}
                    </span>
                    <span className="text-xs text-[var(--ink-400)]">{action.hint}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 border-t border-dashed border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--ink-400)]">
        These steps are suggestions based on the analysis — not legal or financial advice. When in
        doubt, contact the organization through a channel you find and verify yourself.
      </p>
    </section>
  );
}
