import type { InvestigationDomainEvent } from "@/investigations/domain/events/investigation-domain-event";

const encoder = new TextEncoder();
const SSE_ENVELOPE_VERSION = "v2";

export type SsePayloadMode = "legacy" | "strict-v2";

type SerializerOptions = {
  mode?: SsePayloadMode;
};

type InvestigationHandshakeSnapshot = {
  investigationId: string;
  connectedAt: string;
  keepaliveMs: number;
};

type GlobalHandshakeSnapshot = {
  connectedAt: string;
  keepaliveMs: number;
};

export function serializeInvestigationSseEvent(
  event: InvestigationDomainEvent,
  options?: SerializerOptions,
): Uint8Array {
  const emittedAt = new Date().toISOString();
  const envelope = {
    version: SSE_ENVELOPE_VERSION,
    emittedAt,
    data: {
      type: event.type,
      investigationId: event.investigationId,
      occurredAt: event.occurredAt,
      persistedAt: event.persistedAt,
      payload: event.payload,
    },
  };
  const payload = JSON.stringify({
    ...envelope,
    ...(options?.mode === "strict-v2"
      ? {}
      : {
    type: event.type,
    investigationId: event.investigationId,
    occurredAt: event.occurredAt,
    persistedAt: event.persistedAt,
    payload: event.payload,
        }),
  });

  return encoder.encode(`event: ${event.type}\ndata: ${payload}\n\n`);
}

export function serializeKeepaliveComment(): Uint8Array {
  return encoder.encode(`: keepalive\n\n`);
}

export function serializeHandshakeSnapshot(
  snapshot: InvestigationHandshakeSnapshot,
  options?: SerializerOptions,
): Uint8Array {
  const emittedAt = new Date().toISOString();
  const envelope = {
    version: SSE_ENVELOPE_VERSION,
    emittedAt,
    data: {
      investigationId: snapshot.investigationId,
      connectedAt: snapshot.connectedAt,
      keepaliveMs: snapshot.keepaliveMs,
    },
  };
  const payload = JSON.stringify({
    ...envelope,
    ...(options?.mode === "strict-v2"
      ? {}
      : {
    investigationId: snapshot.investigationId,
    connectedAt: snapshot.connectedAt,
    keepaliveMs: snapshot.keepaliveMs,
        }),
  });
  return encoder.encode(`event: investigation.stream_state\ndata: ${payload}\n\n`);
}

export function serializeGlobalHandshakeSnapshot(
  snapshot: GlobalHandshakeSnapshot,
  options?: SerializerOptions,
): Uint8Array {
  const emittedAt = new Date().toISOString();
  const envelope = {
    version: SSE_ENVELOPE_VERSION,
    emittedAt,
    data: {
      connectedAt: snapshot.connectedAt,
      keepaliveMs: snapshot.keepaliveMs,
    },
  };
  const payload = JSON.stringify({
    ...envelope,
    ...(options?.mode === "strict-v2"
      ? {}
      : {
    connectedAt: snapshot.connectedAt,
    keepaliveMs: snapshot.keepaliveMs,
        }),
  });

  return encoder.encode(`event: investigation.stream_state\ndata: ${payload}\n\n`);
}
