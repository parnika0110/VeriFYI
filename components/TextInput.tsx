"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/api-utils";

/**
 * Auto-growing textarea for the claim to analyze. Enter submits (Shift+Enter
 * adds a line — chat-input convention). Labelled, focus-visible ring, 10k cap.
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  disabled,
  maxLength = 10_000,
  rows = 5,
  placeholder = "Paste an internship offer, job message, scholarship message, recruitment message, or any online claim…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow with content, capped by max-height in CSS.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const remaining = maxLength - value.length;

  return (
    <div className="relative">
      <label htmlFor="claim-input" className="sr-only">
        Claim to analyze
      </label>
      <textarea
        id="claim-input"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && onSubmit && value.trim()) {
            e.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          "w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 pb-9 text-[15px] leading-relaxed text-[var(--ink-950)]",
          "placeholder:text-[var(--ink-300)] focus:outline-none",
          "transition-[border-color] duration-150 focus:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60",
          "min-h-[130px] max-h-[420px]",
        )}
      />
      {/* Floating counter + clear — inside the panel so they never cover text. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between">
        <span
          className={cn(
            "rounded-md bg-[var(--surface)] px-1 font-mono text-[11px] tabular-nums text-[var(--ink-300)]",
            remaining < 500 && "text-[var(--ink-500)]",
          )}
          aria-live="polite"
        >
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              ref.current?.focus();
            }}
            disabled={disabled}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--ink-500)] transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--ink-950)] disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
      <p className="mt-1.5 text-right font-mono text-[10px] uppercase tracking-widest text-[var(--ink-300)]">
        Enter to analyze · Shift+Enter for a new line
      </p>
    </div>
  );
}
