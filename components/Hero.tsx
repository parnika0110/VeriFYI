import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { cn } from "@/lib/api-utils";

/**
 * Hero — big statement headline (OPPY principle: say the promise, huge),
 * then the three verification states taught in one calm strip, with a
 * floating claim-card preview showing the product's actual anatomy.
 */

const STATES = [
  {
    icon: CircleCheck,
    label: "Supported",
    blurb: "Evidence backs the claim",
    className:
      "text-[var(--status-supported)] border-[var(--status-supported-border)] bg-[var(--status-supported-soft)]",
  },
  {
    icon: CircleHelp,
    label: "Unverified",
    blurb: "Not enough evidence either way",
    className:
      "text-[var(--status-unverified)] border-[var(--status-unverified-border)] bg-[var(--status-unverified-soft)]",
  },
  {
    icon: CircleX,
    label: "Contradicted",
    blurb: "Evidence goes against it",
    className:
      "text-[var(--status-contradicted)] border-[var(--status-contradicted-border)] bg-[var(--status-contradicted-soft)]",
  },
] as const;

/** Miniature claim card floating beside the headline — shows, not tells. */
function FloatingClaimPreview() {
  return (
    <div
      aria-hidden="true"
      className="animate-float pointer-events-none mx-auto hidden w-full max-w-[340px] lg:block"
      style={{ ["--tilt" as string]: "2deg" }}
    >
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-400)]">
            Claim 01
          </span>
          <span className="rounded-full bg-[var(--cat-lavender)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cat-lavender-deep)]">
            Recruiter
          </span>
        </div>
        <p className="font-space mt-3 text-[15px] font-semibold leading-snug text-[var(--ink-950)]">
          “The recruiter represents the company.”
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-unverified-border)] bg-[var(--status-unverified-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--status-unverified)]">
            <CircleHelp className="size-3.5 fill-current opacity-15" aria-hidden="true" />
            Unverified
          </span>
          <span className="font-mono text-xs font-medium tabular-nums text-[var(--ink-500)]">92%</span>
        </div>
        <div className="mt-4 border-t border-dashed border-[var(--border)] pt-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-400)]">
            Evidence
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-500)]">
            No evidence found — the claim stays unverified, not false.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="bg-glow relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 pb-14 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-500)] shadow-[var(--shadow-card)]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--accent)]" />
              Evidence-first claim verification
            </p>

            <h1 className="animate-fade-up font-space mt-6 text-balance text-[2.75rem] font-bold leading-[1.08] tracking-[-0.035em] text-[var(--ink-950)] sm:text-6xl">
              Before you trust
              <br />
              an opportunity,
              <br />
              <span className="text-[var(--accent)]">verify</span> it.
            </h1>

            <p className="animate-fade-up mt-5 max-w-xl text-pretty text-lg leading-relaxed text-[var(--ink-500)]">
              Paste an internship offer, scholarship message or recruiter DM. VeriFYI shows what
              can actually be verified — and the evidence behind every finding.
            </p>

            {/* The three states — taught before the user ever sees a report */}
            <ul
              className="animate-fade-up mt-8 flex flex-wrap items-center gap-2.5"
              aria-label="The three verification states"
            >
              {STATES.map((state) => (
                <li
                  key={state.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold",
                    state.className,
                  )}
                >
                  <state.icon className="size-4 fill-current opacity-15" aria-hidden="true" />
                  {state.label}
                  <span className="hidden font-normal opacity-80 md:inline">— {state.blurb}</span>
                </li>
              ))}
            </ul>
          </div>

          <FloatingClaimPreview />
        </div>
      </div>
    </section>
  );
}
