import { describe, expect, it } from "bun:test";

import { GET } from "@/app/api/investigations/[id]/events/route";
import { createInvestigationDomainEvent } from "@/investigations/domain/ports/investigation-events-publisher";
import { investigationEventsBroker } from "@/investigations/interfaces/http/dependencies";

describe("GET /api/investigations/[id]/events", () => {
  it("streams published events to SSE clients", async () => {
    const request = new Request("http://localhost/api/investigations/inv-sse/events");
    const response = await GET(request, {
      params: Promise.resolve({ id: "inv-sse" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const initialChunk = await reader?.read();
    const decoder = new TextDecoder();
    let streamed = "";

    if (initialChunk && !initialChunk.done) {
      streamed += decoder.decode(initialChunk.value, { stream: true });
    }

    expect(streamed).toContain("event: investigation.stream_state");
    expect(streamed).toContain('"version":"v2"');
    expect(streamed).toContain('"emittedAt":"');
    expect(streamed).toContain('"data":{"investigationId":"inv-sse"');
    expect(streamed).toContain('"investigationId":"inv-sse"');

    await investigationEventsBroker.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: "inv-sse",
        persistedAt: new Date().toISOString(),
        payload: {
          finding: {
            id: "finding-1",
            title: "Dato",
            summary: "Resumen",
            sourceUrl: "https://example.com/fuente",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    const startedAt = Date.now();

    while (Date.now() - startedAt < 1_500) {
      const chunk = await reader?.read();

      if (!chunk) {
        break;
      }

      if (chunk.done) {
        break;
      }

      streamed += decoder.decode(chunk.value, { stream: true });

      if (streamed.includes("event: investigation.finding_added")) {
        break;
      }
    }

    expect(streamed).toContain("event: investigation.finding_added");
    expect(streamed).toContain('"version":"v2"');
    expect(streamed).toContain('"emittedAt":"');
    expect(streamed).toContain('"data":{"type":"investigation.finding_added"');
    expect(streamed).toContain('"type":"investigation.finding_added"');
    expect(streamed).toContain('"investigationId":"inv-sse"');

    await reader?.cancel();
  });

  it("supports strict-v2 payload mode through query param", async () => {
    const request = new Request(
      "http://localhost/api/investigations/inv-sse/events?payloadMode=strict-v2",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "inv-sse" }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader?.read();
    let streamed = "";

    if (firstChunk && !firstChunk.done) {
      streamed += decoder.decode(firstChunk.value, { stream: true });
    }

    await investigationEventsBroker.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: "inv-sse",
        persistedAt: new Date().toISOString(),
        payload: {
          finding: {
            id: "finding-strict",
            title: "Dato",
            summary: "Resumen",
            sourceUrl: "https://example.com/fuente",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    const startedAt = Date.now();

    while (Date.now() - startedAt < 1_500) {
      const chunk = await reader?.read();

      if (!chunk || chunk.done) {
        break;
      }

      streamed += decoder.decode(chunk.value, { stream: true });

      if (streamed.includes("event: investigation.finding_added")) {
        break;
      }
    }

    const lines = streamed
      .split("\n")
      .filter((line) => line.startsWith("data: ") && line.includes('"type":"investigation.finding_added"'));

    const payload = JSON.parse(lines[0]?.slice(6) ?? "{}") as {
      data?: { type?: string; investigationId?: string };
      type?: string;
      investigationId?: string;
    };

    expect(payload.type).toBeUndefined();
    expect(payload.investigationId).toBeUndefined();
    expect(payload.data?.type).toBe("investigation.finding_added");
    expect(payload.data?.investigationId).toBe("inv-sse");

    await reader?.cancel();
  });
});
