import type { InvestigationStreamEvent } from "@/investigations/interfaces/web/contracts";

type V2Envelope = {
  version?: string;
  emittedAt?: string;
  data?: {
    type?: string;
    occurredAt?: string;
    payload?: unknown;
    [key: string]: unknown;
  };
  type?: string;
  occurredAt?: string;
  payload?: unknown;
  [key: string]: unknown;
};

const MAX_SUMMARY_LENGTH = 180;

export function parseInvestigationStreamMessage(input: {
  eventType: string;
  data: string;
}): InvestigationStreamEvent {
  const parsed = tryParseJson(input.data);
  const envelope = isRecord(parsed) ? (parsed as V2Envelope) : null;
  const v2Data = isRecord(envelope?.data) ? envelope.data : null;

  const effectiveType =
    toNonEmptyString(v2Data?.type) ?? toNonEmptyString(envelope?.type) ?? input.eventType;
  const timestamp =
    toIsoString(v2Data?.occurredAt) ??
    toIsoString(envelope?.occurredAt) ??
    toIsoString(envelope?.emittedAt) ??
    new Date().toISOString();
  const payload = v2Data?.payload ?? envelope?.payload ?? envelope ?? input.data;

  return {
    type: effectiveType,
    timestamp,
    payloadSummary: summarizePayload(payload),
    rawPayload: payload,
  };
}

function summarizePayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "sin payload";
  }

  if (typeof payload === "string") {
    return truncate(payload);
  }

  try {
    return truncate(JSON.stringify(payload));
  } catch {
    return "payload no serializable";
  }
}

function truncate(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_SUMMARY_LENGTH)}...`;
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0 || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
