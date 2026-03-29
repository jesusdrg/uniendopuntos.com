import { describe, expect, it } from "bun:test";

import { GET } from "@/app/api/investigations/events/route";
import { createInvestigationDomainEvent } from "@/investigations/domain/ports/investigation-events-publisher";
import {
  investigationEventsBroker,
  sseStreamControl,
} from "@/investigations/interfaces/http/dependencies";

describe("GET /api/investigations/events", () => {
  it("streams events from multiple investigations", async () => {
    const request = new Request("http://localhost/api/investigations/events");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const initialChunk = await reader?.read();
    let streamed = "";

    if (initialChunk && !initialChunk.done) {
      streamed += decoder.decode(initialChunk.value, { stream: true });
    }

    expect(streamed).toContain("event: investigation.stream_state");
    expect(streamed).toContain('"version":"v2"');
    expect(streamed).toContain('"emittedAt":"');

    await investigationEventsBroker.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: "inv-global-a",
        persistedAt: new Date().toISOString(),
        payload: {
          investigation: {
            id: "inv-global-a",
            query: "Tema A",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            findings: [],
            blockedSources: [],
          },
        },
      }),
    );

    await investigationEventsBroker.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: "inv-global-b",
        persistedAt: new Date().toISOString(),
        payload: {
          investigation: {
            id: "inv-global-b",
            query: "Tema B",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            findings: [],
            blockedSources: [],
          },
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

      if (
        streamed.includes('"investigationId":"inv-global-a"') &&
        streamed.includes('"investigationId":"inv-global-b"')
      ) {
        break;
      }
    }

    expect(streamed).toContain("event: investigation.created");
    expect(streamed).toContain('"data":{"type":"investigation.created"');
    expect(streamed).toContain('"investigationId":"inv-global-a"');
    expect(streamed).toContain('"investigationId":"inv-global-b"');

    await reader?.cancel();
  });

  it("rejects when global subscriber limit is reached", async () => {
    sseStreamControl.reset();

    const maxSubscribers = sseStreamControl.snapshot().maxGlobalSubscribers;

    for (let index = 0; index < maxSubscribers; index += 1) {
      sseStreamControl.tryAcquireGlobalSubscriber();
    }

    const secondResponse = await GET(new Request("http://localhost/api/investigations/events"));

    expect(secondResponse.status).toBe(503);
    const payload = (await secondResponse.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("SSE_SUBSCRIBER_LIMIT_REACHED");

    for (let index = 0; index < maxSubscribers; index += 1) {
      sseStreamControl.releaseGlobalSubscriber();
    }
  });
});
