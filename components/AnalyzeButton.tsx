import { LoaderCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/api-utils";

/** Primary call-to-action pill. Shows "Analyzing…" while busy. */
export function AnalyzeButton({
  onClick,
  disabled,
  busy,
  hasFile,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  hasFile?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold",
        "bg-[var(--ink-950)] text-[var(--surface)] shadow-[var(--shadow-card)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] active:translate-y-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {busy ? (
        <>
          <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" />
          Analyzing…
        </>
      ) : (
        <>
          {hasFile ? "Analyze File" : "Analyze"}
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
}
