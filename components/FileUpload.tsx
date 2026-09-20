"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, FileText, FileImage, FileX, LoaderCircle, X } from "lucide-react";
import { cn, formatBytes, validateFile } from "@/lib/api-utils";

/**
 * Upload UI for screenshots (PNG/JPG) and PDFs. Drag-and-drop + click to
 * browse, with validation, preview, and a mock "processing" progress state.
 *
 * BACKEND INTEGRATION POINT: see onFileSelected below. When the backend
 * exposes an upload endpoint (S3 + Textract, per the architecture), replace
 * the mock progress with a real POST and extract text to feed analysis.
 */

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  /** Data URL for image previews; undefined for PDFs. */
  previewUrl?: string;
}

type UploadStatus = "idle" | "validating" | "uploading" | "ready" | "error";

const ACCEPT = ".png,.jpg,.jpeg,.pdf";

export function FileUpload({
  file,
  onFileChange,
  disabled,
}: {
  file: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Simulated progress while in mock upload mode. Progress is reset where
  // the status transitions (not in the effect body) to avoid cascading renders.
  useEffect(() => {
    if (status !== "uploading") return;
    const tick = setInterval(() => {
      setProgress((p) => Math.min(96, p + 7 + Math.random() * 9));
    }, 150);
    return () => clearInterval(tick);
  }, [status]);

  // Clear pending timers on unmount.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  const handleFile = useCallback(
    (candidate: File) => {
      if (disabled) return;
      reset();
      setStatus("validating");
      const result = validateFile(candidate);
      if (!result.ok) {
        setStatus("error");
        setError(result.message);
        return;
      }
      setStatus("uploading");
      setProgress(0);
      const finish = 500 + Math.random() * 700;
      timers.current.push(
        setTimeout(() => {
          const isImage = candidate.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(candidate.name);
          const next: UploadedFile = {
            name: candidate.name,
            size: candidate.size,
            type: candidate.type || "application/octet-stream",
            previewUrl: isImage ? URL.createObjectURL(candidate) : undefined,
          };
          setProgress(100);
          setStatus("ready");
          onFileChange(next);
        }, finish),
      );
    },
    [disabled, onFileChange, reset],
  );

  function removeFile() {
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    onFileChange(null);
    reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = status === "uploading" || status === "validating";

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        id="file-upload-input"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {!file ? (
        <button
          type="button"
          aria-labelledby="file-upload-input"
          aria-describedby="upload-hint"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all duration-200",
            "bg-dots",
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-card)]"
              : "border-[var(--border-strong)] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 hover:shadow-[var(--shadow-card)]",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {busy ? (
            <LoaderCircle className="size-6 animate-spin text-[var(--accent)]" aria-hidden="true" />
          ) : (
            <CloudUpload
              className="size-6 text-[var(--ink-400)] transition-colors group-hover:text-[var(--accent)]"
              aria-hidden="true"
            />
          )}
          <span className="text-sm font-medium text-[var(--ink-950)]">
            {busy ? "Reading file…" : "Drop a screenshot or PDF here, or click to browse"}
          </span>
          <span id="upload-hint" className="text-xs text-[var(--ink-400)]">
            PNG, JPG or PDF · up to 10 MB
          </span>
          {status === "uploading" && (
            <span className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <span
                className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </span>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
          {file.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.previewUrl}
              alt={`Preview of ${file.name}`}
              className="size-12 rounded-lg border border-[var(--border)] object-cover"
            />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)] text-[var(--ink-500)]">
              <FileText className="size-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink-950)]">{file.name}</p>
            <p className="text-xs text-[var(--ink-400)]">
              {formatBytes(file.size)} · {file.type || "file"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-supported-border)] bg-[var(--status-supported-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--status-supported)]">
            <FileImage className="size-3.5" aria-hidden="true" />
            Ready
          </span>
          <button
            type="button"
            onClick={removeFile}
            aria-label={`Remove ${file.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--ink-400)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--status-contradicted)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-[var(--status-contradicted)]">
          <FileX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
