/** Tiny className combiner — avoids pulling in clsx/tailwind-merge. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Format a byte count as a short human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** JSON type guards — used to validate API responses without `any`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export type FileValidationResult =
  | { ok: true; file: File }
  | { ok: false; reason: "type" | "size"; message: string };

const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  // Some browsers/OSes report empty or generic MIME for odd extensions —
  // fall back to extension checks below.
  "",
];
const ACCEPTED_EXT = [".png", ".jpg", ".jpeg", ".pdf"];
export const MAX_FILE_MB = 10;

/** Validate an uploaded file before it reaches any backend. */
export function validateFile(file: File): FileValidationResult {
  const name = file.name.toLowerCase();
  const extOk = ACCEPTED_EXT.some((ext) => name.endsWith(ext));
  const mimeOk = ACCEPTED_MIME.includes(file.type);
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      reason: "type",
      message: `“${file.name}” isn’t a supported file type. Please upload a PNG, JPG or PDF.`,
    };
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return {
      ok: false,
      reason: "size",
      message: `“${file.name}” is ${formatBytes(file.size)}. Files must be under ${MAX_FILE_MB} MB.`,
    };
  }
  return { ok: true, file };
}
