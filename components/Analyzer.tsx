"use client";

import { useState } from "react";
import { CircleAlert, FileUp, FileType2, ArrowRight, Sparkles } from "lucide-react";
import { TextInput } from "./TextInput";
import { FileUpload } from "./FileUpload";
import type { UploadedFile } from "./FileUpload";
import { SAMPLE_SUSPICIOUS, SAMPLE_LEGITIMATE, SAMPLE_AMBIGUOUS } from "@/lib/mock-data";
import { cn } from "@/lib/api-utils";

/**
 * The analyzer — the product's front door, styled like a conversational
 * starting point (OPPY principle: the input IS the landing action, not a
 * form). The Analyze button lives inside the panel; uploads and samples
 * sit beneath as quiet secondary paths.
 */

type InputMode = "text" | "file";

export function Analyzer({
  onAnalyze,
  busy,
}: {
  onAnalyze: (input: { text: string; file: UploadedFile | null }) => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = mode === "text" ? text.trim().length > 0 : file !== null;

  function handleAnalyze() {
    if (busy) return;
    if (mode === "text" && !text.trim()) {
      setError("Paste a message to analyze first — the input is empty.");
      return;
    }
    if (mode === "file" && !file) {
      setError("Upload a screenshot or PDF first, then press Analyze.");
      return;
    }
    setError(null);
    onAnalyze({ text, file });
  }

  function applySample(value: string) {
    setMode("text");
    setText(value);
    setError(null);
    requestAnimationFrame(() => document.getElementById("claim-input")?.focus());
  }

  return (
    <section id="analyzer" aria-label="Analyze a claim" className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <h2 className="font-space text-center text-2xl font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--ink-950)] sm:text-[1.7rem]">
        What are you unsure about?
      </h2>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition-shadow duration-200 focus-within:shadow-[var(--shadow-lift)] sm:p-5">
        {/* Mode switch — quiet, above the panel content */}
        <div className="mb-3 flex items-center justify-between">
          <div
            role="tablist"
            aria-label="Input method"
            className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
          >
            {(
              [
                { id: "text", label: "Paste text" },
                { id: "file", label: "Upload file" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setError(null);
                }}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200",
                  mode === tab.id
                    ? "bg-[var(--surface)] text-[var(--ink-950)] shadow-[var(--shadow-card)]"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-950)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="hidden font-mono text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)] sm:inline">
            Free · no sign-up
          </span>
        </div>

        {mode === "text" ? (
          <TextInput
            value={text}
            onChange={(v) => {
              setText(v);
              setError(null);
            }}
            disabled={busy}
            onSubmit={handleAnalyze}
            placeholder="Paste an internship offer, job message, scholarship message, recruitment message, or any online claim…"
          />
        ) : (
          <FileUpload file={file} onFileChange={(f) => { setFile(f); setError(null); }} disabled={busy} />
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-[var(--status-contradicted)]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {/* Action row inside the panel */}
        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze || busy}
            className={cn(
              "group inline-flex h-11 items-center gap-2 rounded-full px-6 font-space text-sm font-semibold transition-all duration-200",
              "bg-[var(--ink-950)] text-[var(--surface)] shadow-[var(--shadow-card)]",
              "hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] active:translate-y-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            {busy ? "Analyzing…" : "Analyze"}
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Secondary paths — uploads + samples, calm and discoverable */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[var(--ink-500)]">
          <button
            type="button"
            onClick={() => setMode("file")}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--ink-950)]"
          >
            <FileUp className="size-4" aria-hidden="true" />
            Upload screenshot
          </button>
          <button
            type="button"
            onClick={() => setMode("file")}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--ink-950)]"
          >
            <FileType2 className="size-4" aria-hidden="true" />
            Upload PDF
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--ink-500)]">
            <Sparkles className="size-3" aria-hidden="true" />
            Try a sample
          </span>
          {[
            { label: "Suspicious offer", value: SAMPLE_SUSPICIOUS, hover: "hover:border-[var(--status-contradicted-border)] hover:text-[var(--status-contradicted)]" },
            { label: "Ambiguous message", value: SAMPLE_AMBIGUOUS, hover: "hover:border-[var(--status-unverified-border)] hover:text-[var(--status-unverified)]" },
            { label: "Legitimate offer", value: SAMPLE_LEGITIMATE, hover: "hover:border-[var(--status-supported-border)] hover:text-[var(--status-supported)]" },
          ].map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => applySample(sample.value)}
              className={cn(
                "rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ink-700)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
                sample.hover,
              )}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
