import { describe, expect, it } from "bun:test";

import { createInvestigationDomainEvent } from "@/investigations/domain/ports/investigation-events-publisher";
import {
  serializeGlobalHandshakeSnapshot,
  serializeHandshakeSnapshot,
  serializeInvestigationSseEvent,
} from "@/investigations/infrastructure/realtime/sse-event-serializer";

describe("SSE event serializer contract", () => {
  it("adds v2 envelope fields and keeps legacy keys for investigation events", () => {
    const chunk = serializeInvestigationSseEvent(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: "inv-serializer",
        persistedAt: new Date().toISOString(),
        payload: {
          finding: {
            id: "finding-1",
            title: "Dato",
            sourceUrl: "https://example.com",
            summary: "Resumen",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    const text = new TextDecoder().decode(chunk);

    expect(text).toContain("event: investigation.finding_added");
    expect(text).toContain('"version":"v2"');
    expect(text).toContain('"emittedAt":"');
    expect(text).toContain('"data":{"type":"investigation.finding_added"');
    expect(text).toContain('"type":"investigation.finding_added"');
    expect(text).toContain('"investigationId":"inv-serializer"');
  });

  it("serializes investigation and global handshake snapshots with versioned envelope", () => {
    const investigationChunk = serializeHandshakeSnapshot({
      investigationId: "inv-handshake",
      connectedAt: new Date().toISOString(),
      keepaliveMs: 15_000,
    });

    const globalChunk = serializeGlobalHandshakeSnapshot({
      connectedAt: new Date().toISOString(),
      keepaliveMs: 15_000,
    });

    const investigationText = new TextDecoder().decode(investigationChunk);
    const globalText = new TextDecoder().decode(globalChunk);

    expect(investigationText).toContain("event: investigation.stream_state");
    expect(investigationText).toContain('"version":"v2"');
    expect(investigationText).toContain('"emittedAt":"');
    expect(investigationText).toContain('"data":{"investigationId":"inv-handshake"');
    expect(investigationText).toContain('"investigationId":"inv-handshake"');

    expect(globalText).toContain("event: investigation.stream_state");
    expect(globalText).toContain('"version":"v2"');
    expect(globalText).toContain('"emittedAt":"');
    expect(globalText).toContain('"data":{"connectedAt":"');
    expect(globalText).toContain('"connectedAt":"');
  });

  it("supports strict-v2 mode without legacy duplicated payload", () => {
    const eventChunk = serializeInvestigationSseEvent(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: "inv-strict",
        persistedAt: new Date().toISOString(),
        payload: {
          finding: {
            id: "finding-1",
            title: "Dato",
            sourceUrl: "https://example.com",
            summary: "Resumen",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      }),
      { mode: "strict-v2" },
    );

    const handshakeChunk = serializeGlobalHandshakeSnapshot(
      {
        connectedAt: new Date().toISOString(),
        keepaliveMs: 15_000,
      },
      { mode: "strict-v2" },
    );

    const eventText = new TextDecoder().decode(eventChunk);
    const handshakeText = new TextDecoder().decode(handshakeChunk);
    const eventPayload = JSON.parse(
      eventText.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "{}",
    ) as {
      version: string;
      data?: { type?: string; investigationId?: string };
      type?: string;
      investigationId?: string;
    };
    const handshakePayload = JSON.parse(
      handshakeText.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "{}",
    ) as {
      version: string;
      data?: { connectedAt?: string; keepaliveMs?: number };
      connectedAt?: string;
      keepaliveMs?: number;
    };

    expect(eventText).toContain('"version":"v2"');
    expect(eventText).toContain('"data":{"type":"investigation.finding_added"');
    expect(eventPayload.type).toBeUndefined();
    expect(eventPayload.investigationId).toBeUndefined();
    expect(eventPayload.data?.investigationId).toBe("inv-strict");
    expect(handshakeText).toContain('"version":"v2"');
    expect(handshakeText).toContain('"data":{"connectedAt":"');
    expect(handshakePayload.connectedAt).toBeUndefined();
    expect(handshakePayload.keepaliveMs).toBeUndefined();
    expect(handshakePayload.data?.keepaliveMs).toBe(15_000);
  });
});
