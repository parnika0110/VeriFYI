import { Bot } from "lucide-react";
import { LogoMark } from "./LogoMark";

/**
 * Problem-contrast section (OPPY principle: name the enemy simply —
 * "17 tabs" → here, "AI guesses, VeriFYI shows"). Two-column comparison,
 * generous whitespace, no bashing — just the honest difference.
 */

const AI_SIDE = [
  "One confident answer, no sources",
  "Same energy for a real offer and a fake one",
  "“Probably a scam” — probably isn't evidence",
  "You're back where you started: unsure",
];

const VERIFYI_SIDE = [
  "Claims separated and checked one by one",
  "Every artifact labeled: yours vs external vs AI",
  "Says “Unverified” when the evidence runs out",
  "A checklist of what to do next",
];

export function WhyNotJustAI() {
  return (
    <section
      aria-labelledby="why-verifyi-heading"
      className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20"
    >
      <p className="text-center font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
        Why not just ask AI?
      </p>
      <h2
        id="why-verifyi-heading"
        className="font-space mt-3 text-center text-2xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)] sm:text-3xl"
      >
        An opinion isn&apos;t verification.
      </h2>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {/* Asking AI */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
            <Bot className="size-4" aria-hidden="true" />
            Asking an AI chatbot
          </span>
          <ul className="mt-5 space-y-3.5">
            {AI_SIDE.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[var(--ink-500)]">
                <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--ink-300)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Verifying with VeriFYI */}
        <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8">
          <span className="inline-flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--accent)]">
            <LogoMark className="size-4 rounded-[5px]" aria-hidden="true" />
            Verifying with VeriFYI
          </span>
          <ul className="mt-5 space-y-3.5">
            {VERIFYI_SIDE.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[var(--ink-700)]">
                <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
