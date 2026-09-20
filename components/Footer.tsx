import { LogoMark } from "./LogoMark";

/** Footer — closing statement, quick links, and the evidence-first reminder. */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        {/* Closing CTA */}
        <div className="border-b border-dashed border-[var(--border)] pb-10 text-center">
          <h2 className="font-space text-balance text-2xl font-bold leading-[1.12] tracking-[-0.03em] text-[var(--ink-950)] sm:text-3xl">
            There&apos;s probably a claim
            <br className="hidden sm:block" /> worth verifying.
          </h2>
          <a
            href="#analyzer"
            className="mt-6 inline-flex h-11 items-center rounded-full bg-[var(--ink-950)] px-6 font-space text-sm font-semibold text-[var(--surface)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[var(--shadow-lift)]"
          >
            Verify what matters →
          </a>
        </div>

        <div className="flex flex-col items-start justify-between gap-8 pt-10 md:flex-row md:items-center">
          <div>
            <span className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center">
                <LogoMark className="size-8" />
              </span>
              <span className="font-space text-base font-bold tracking-tight text-[var(--ink-950)]">
                Veri<span className="text-[var(--accent)]">FYI</span>
              </span>
            </span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-500)]">
              Don&apos;t just ask whether an opportunity is trustworthy. See what can actually be
              verified.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--ink-500)]">
              <li>
                <a href="#analyzer" className="transition-colors duration-200 hover:text-[var(--ink-950)]">
                  Analyze a claim
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="transition-colors duration-200 hover:text-[var(--ink-950)]">
                  How it works
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[13px] transition-colors duration-200 hover:text-[var(--ink-950)]"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-[var(--border)] pt-6 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-400)]">
          <p>VeriFYI reports evidence, not verdicts.</p>
        </div>
      </div>
    </footer>
  );
}
