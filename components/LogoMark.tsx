import { cn } from "@/lib/api-utils";

/**
 * VeriFYI brand mark — the "V-check" monogram.
 *
 * A bold checkmark drawn wide enough to read as the V of "VeriFYI": one
 * stroke carries both "verification" and the brand initial. Custom path,
 * deliberately not a stock icon. Tuned for the light theme: accent-indigo
 * tile, paper-white check (token-driven, so dark mode stays coherent).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="VeriFYI logo"
      className={cn("shrink-0", className)}
    >
      {/* Rounded accent tile */}
      <rect x="0" y="0" width="48" height="48" rx="12" className="fill-[var(--accent)]" />
      {/* V-check: wide checkmark reading as the initial V */}
      <path
        d="M11 25.5 L20.5 35 L37 14.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full brand lockup: mark + wordmark with mono tagline.
 * Used in Navbar, Footer, error/report surfaces.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <span className="font-space text-lg font-bold tracking-[-0.02em] text-[var(--ink-950)]">
        Veri<span className="text-[var(--accent)]">FYI</span>
        <span className="ml-1.5 hidden font-mono text-[11px] font-medium tracking-[0.03em] text-[var(--ink-400)] sm:inline">
          verify what matters
        </span>
      </span>
    </span>
  );
}
