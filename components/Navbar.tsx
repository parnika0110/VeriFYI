"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { USE_MOCK } from "@/lib/api";
import { cn } from "@/lib/api-utils";
import { Logo } from "./LogoMark";

function ModeIndicator() {
  const mock = USE_MOCK;
  return (
    <span        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] sm:inline-flex",
        mock
          ? "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-500)]"
          : "border-[var(--status-supported-border)] bg-[var(--status-supported-soft)] text-[var(--status-supported)]",
      )}
      title={
        mock
          ? "Mock mode: using local demo data (NEXT_PUBLIC_USE_MOCK=true)"
          : "Live mode: calling the real analysis API"
      }
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          mock ? "bg-[var(--ink-400)]" : "bg-[var(--status-supported)] animate-pulse",
        )}
      />
      {mock ? "Mock data" : "Live API"}
    </span>
  );
}

/**
 * Theme toggle. The html element's `dark` class is applied pre-hydration by
 * the inline script in app/layout.tsx (no theme flash); React state here only
 * mirrors the DOM for the icon, synced after paint.
 */
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem("verifyi-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — theme still toggles for this session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--ink-950)]"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/** Slow marquee of claim types — quiet proof of scope, OPPY-style. */
export function ClaimTicker() {
  const items = [
    "Internship offers",
    "Scholarship messages",
    "Recruiter DMs",
    "Job listings",
    "Course promotions",
    "Fellowship emails",
    "Hackathon invites",
    "Selection notices",
  ];
  const row = [...items, ...items];
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden border-y border-[var(--border)] bg-[var(--surface)] py-2.5"
    >
      <div className="animate-marquee flex w-max items-center gap-8 whitespace-nowrap">
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-8 font-space text-[12.8px] font-medium uppercase tracking-[0.04em] text-[var(--ink-500)]"
          >
            {item}
            <span className="size-1 rounded-full bg-[var(--border-strong)]" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <a href="#" aria-label="VeriFYI home" className="rounded-xl">
          <Logo />
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <ModeIndicator />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
