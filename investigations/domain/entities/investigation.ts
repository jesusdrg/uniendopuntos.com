export type InvestigationStatus = "active" | "paused" | "completed";

export type FindingCard = {
  id: string;
  title: string;
  sourceUrl: string;
  summary: string;
  createdAt: string;
};

export const BLOCKED_SOURCE_REASON_CATEGORIES = [
  "robots",
  "paywall",
  "captcha",
  "access_denied",
  "timeout",
  "other",
] as const;

export type BlockedSourceReasonCategory = (typeof BLOCKED_SOURCE_REASON_CATEGORIES)[number];

export type BlockedSource = {
  id: string;
  url: string;
  reasonCategory: BlockedSourceReasonCategory;
  note?: string;
  blockedAt: string;
};

export type Investigation = {
  id: string;
  query: string;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  findings: FindingCard[];
  blockedSources: BlockedSource[];
};
