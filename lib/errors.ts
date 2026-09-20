/**
 * Controlled error taxonomy.
 *
 * Client-facing messages never include stack traces, AWS request IDs, or
 * credential material — those stay in server-side logs only.
 */

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INPUT_TOO_LARGE"
  | "EMPTY_INPUT"
  | "ANALYSIS_FAILED"
  | "MODEL_OUTPUT_INVALID"
  | "UPSTREAM_TIMEOUT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  /** Extra detail for server logs only (never sent to the client). */
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { httpStatus?: number; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = options?.httpStatus ?? httpStatusForCode(code);
    this.details = options?.details;
  }
}

export function httpStatusForCode(code: ErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    case "INPUT_TOO_LARGE":
      return 413;
    case "EMPTY_INPUT":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "UPSTREAM_TIMEOUT":
      return 504;
    case "ANALYSIS_FAILED":
    case "MODEL_OUTPUT_INVALID":
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

const SAFE_CLIENT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: "Invalid request. Provide a JSON body like { \"text\": \"...\" }.",
  INPUT_TOO_LARGE: "Input is too large. Please submit a shorter text.",
  EMPTY_INPUT: "Input text must not be empty.",
  ANALYSIS_FAILED: "The analysis could not be completed at this time. Please try again.",
  MODEL_OUTPUT_INVALID: "The analysis produced an unreadable result. Please try again.",
  UPSTREAM_TIMEOUT: "The analysis took too long. Please try again with a shorter text.",
  NOT_FOUND: "Resource not found.",
  INTERNAL_ERROR: "An internal error occurred. Please try again later.",
};

/** The only error shape that may be serialized to a client. */
export function toClientError(error: unknown): { status: number; body: { success: false; error: string } } {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: { success: false, error: SAFE_CLIENT_MESSAGES[error.code] },
    };
  }
  return {
    status: 500,
    body: { success: false, error: SAFE_CLIENT_MESSAGES.INTERNAL_ERROR },
  };
}
