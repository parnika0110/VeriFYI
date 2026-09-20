import type { ClaimCategory, ClaimStatus, OverallStatus } from "./types";

/**
 * Single source of truth for how each verification status looks and reads.
 * Status is NEVER communicated by color alone — every entry pairs an icon
 * (rendered by components/status.tsx) with a label and an accessible blurb.
 */
export const STATUS_META: Record<
  ClaimStatus,
  { label: string; icon: "circle-check" | "circle-help" | "circle-x"; blurb: string }
> = {
  SUPPORTED: {
    label: "Supported",
    icon: "circle-check",
    blurb: "Evidence found that supports this claim.",
  },
  UNVERIFIED: {
    label: "Unverified",
    icon: "circle-help",
    blurb: "Not enough evidence either way. Verify before you trust.",
  },
  CONTRADICTED: {
    label: "Contradicted",
    icon: "circle-x",
    blurb: "Evidence goes against this claim.",
  },
};

export const OVERALL_STATUS_META: Record<
  OverallStatus,
  { label: string; blurb: string }
> = {
  ALL_SUPPORTED: {
    label: "All Claims Supported",
    blurb: "Every extracted claim found supporting evidence.",
  },
  PARTIALLY_VERIFIED: {
    label: "Partially Verified",
    blurb: "Some claims verified; others need a closer look.",
  },
  NEEDS_VERIFICATION: {
    label: "Needs Verification",
    blurb: "Key claims could not be verified. Check before you trust.",
  },
  HIGH_RISK: {
    label: "High Risk",
    blurb: "Some claims are contradicted by known patterns. Treat with caution.",
  },
  NO_CLAIMS: {
    label: "No Checkable Claims",
    blurb: "No verifiable claims were found in the input.",
  },
};

/** Per-category next-step copy for the action checklist. */
export const CATEGORY_ACTION_HINTS: Record<ClaimCategory, string> = {
  RECRUITER: "Verify the recruiter through the company's official website",
  COMPANY: "Confirm the job listing independently on the company's careers site",
  COMPENSATION: "Ask for the official offer letter on company letterhead",
  PAYMENT: "Avoid sending payment before verification",
  CONTACT: "Cross-check contact details against the official website",
  SCHOLARSHIP: "Confirm the scholarship on the official provider's portal",
  COURSE: "Check the course provider's accreditation independently",
  URGENCY: "Don't let deadlines pressure you — real offers survive a day's pause",
  OTHER: "Cross-check this claim through an official channel",
};

/** Short labels for claim categories on compact cards. */
export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  RECRUITER: "Recruiter",
  COMPANY: "Company",
  COMPENSATION: "Compensation",
  PAYMENT: "Payment",
  CONTACT: "Contact",
  SCHOLARSHIP: "Scholarship",
  COURSE: "Course",
  URGENCY: "Urgency",
  OTHER: "Other",
};

/**
 * OPPY-inspired pastel category tints. Each category gets a soft chip
 * background + deep readable text (light and dark tuned via tokens).
 */
export const CATEGORY_TINTS: Record<
  ClaimCategory,
  { chip: string; dot: string }
> = {
  RECRUITER: {
    chip: "bg-[var(--cat-lavender)] text-[var(--cat-lavender-deep)]",
    dot: "bg-[var(--cat-lavender-deep)]",
  },
  COMPANY: {
    chip: "bg-[var(--cat-blue)] text-[var(--cat-blue-deep)]",
    dot: "bg-[var(--cat-blue-deep)]",
  },
  COMPENSATION: {
    chip: "bg-[var(--cat-sage)] text-[var(--cat-sage-deep)]",
    dot: "bg-[var(--cat-sage-deep)]",
  },
  PAYMENT: {
    chip: "bg-[var(--cat-rose)] text-[var(--cat-rose-deep)]",
    dot: "bg-[var(--cat-rose-deep)]",
  },
  CONTACT: {
    chip: "bg-[var(--cat-peach)] text-[var(--cat-peach-deep)]",
    dot: "bg-[var(--cat-peach-deep)]",
  },
  SCHOLARSHIP: {
    chip: "bg-[var(--cat-blue)] text-[var(--cat-blue-deep)]",
    dot: "bg-[var(--cat-blue-deep)]",
  },
  COURSE: {
    chip: "bg-[var(--cat-sage)] text-[var(--cat-sage-deep)]",
    dot: "bg-[var(--cat-sage-deep)]",
  },
  URGENCY: {
    chip: "bg-[var(--cat-peach)] text-[var(--cat-peach-deep)]",
    dot: "bg-[var(--cat-peach-deep)]",
  },
  OTHER: {
    chip: "bg-[var(--surface-muted)] text-[var(--ink-500)]",
    dot: "bg-[var(--ink-400)]",
  },
};
