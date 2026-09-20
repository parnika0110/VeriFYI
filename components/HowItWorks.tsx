import { ListChecks, Scale, Search } from "lucide-react";

/**
 * "How it works" — numbered pipeline steps (OPPY principle: 01→04 with
 * generous whitespace makes a process feel simple). Mirrors the real
 * backend architecture: claims → evidence → statuses → actions.
 */

const STEPS = [
  {
    num: "01",
    icon: Search,
    title: "Paste",
    detail:
      "Drop in any offer, message or listing — the text is split into individual, checkable assertions.",
  },
  {
    num: "02",
    icon: Scale,
    title: "Verify",
    detail:
      "Each claim is checked against your input and external sources. Every artifact is shown and labeled by origin.",
  },
  {
    num: "03",
    icon: ListChecks,
    title: "Understand",
    detail:
      "Claims come back Supported, Unverified or Contradicted — with the reasoning behind every status.",
  },
  {
    num: "04",
    icon: ShieldIcon,
    title: "Act",
    detail:
      "A concrete checklist of next steps, based on what the evidence actually shows. Never a blind verdict.",
  },
] as const;

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20"
    >
      <p className="text-center font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-500)]">
        How it works
      </p>
      <h2
        id="how-it-works-heading"
        className="font-space mt-3 text-center text-2xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)] sm:text-3xl"
      >
        From message to decision,
        <br className="hidden sm:block" /> in four steps.
      </h2>

      <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {/* Connecting line on desktop */}
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-5 hidden border-t border-dashed border-[var(--border-strong)] lg:block"
        />
        {STEPS.map((step) => (
          <li key={step.num} className="relative">
            <span className="relative z-10 inline-grid size-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
              <step.icon className="size-4.5 text-[var(--accent)]" aria-hidden="true" />
            </span>
            <p className="mt-4 font-mono text-2xl font-semibold leading-none text-[var(--accent)] opacity-35">
              {step.num}
            </p>
            <h3 className="font-space mt-1.5 text-[17px] font-semibold tracking-[-0.01em] text-[var(--ink-950)]">
              {step.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-500)]">{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
