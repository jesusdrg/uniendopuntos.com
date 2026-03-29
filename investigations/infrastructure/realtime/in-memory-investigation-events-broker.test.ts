import { describe, expect, it } from "bun:test";

import { createInvestigationDomainEvent } from "@/investigations/domain/ports/investigation-events-publisher";
import { InMemoryInvestigationEventsBroker } from "@/investigations/infrastructure/realtime/in-memory-investigation-events-broker";

describe("InMemoryInvestigationEventsBroker", () => {
  it("delivers the same event to multiple subscribers", async () => {
    const broker = new InMemoryInvestigationEventsBroker();
    const receivedByFirst: string[] = [];
    const receivedBySecond: string[] = [];

    broker.subscribe("inv-1", (event) => {
      receivedByFirst.push(event.type);
    });

    broker.subscribe("inv-1", (event) => {
      receivedBySecond.push(event.type);
    });

    const result = await broker.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: "inv-1",
        persistedAt: new Date().toISOString(),
        payload: {
          investigation: {
            id: "inv-1",
            query: "Tema",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            findings: [],
            blockedSources: [],
          },
        },
      }),
    );

    expect(receivedByFirst).toEqual(["investigation.created"]);
    expect(receivedBySecond).toEqual(["investigation.created"]);
    expect(result.deliveredAt).toHaveLength(2);
  });

  it("does not fail when there are no subscribers", async () => {
    const broker = new InMemoryInvestigationEventsBroker();

    const result = await broker.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: "inv-no-subs",
        persistedAt: new Date().toISOString(),
        payload: {
          finding: {
            id: "f-1",
            title: "Hallazgo",
            sourceUrl: "https://example.com",
            summary: "Resumen",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    expect(result.deliveredAt).toEqual([]);
  });

  it("delivers published events to global subscribers", async () => {
    const broker = new InMemoryInvestigationEventsBroker();
    const receivedInvestigationIds: string[] = [];

    broker.subscribeAll((event) => {
      receivedInvestigationIds.push(event.investigationId);
    });

    await broker.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: "inv-global-1",
        persistedAt: new Date().toISOString(),
        payload: {
          investigation: {
            id: "inv-global-1",
            query: "Tema 1",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            findings: [],
            blockedSources: [],
          },
        },
      }),
    );

    await broker.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: "inv-global-2",
        persistedAt: new Date().toISOString(),
        payload: {
          investigation: {
            id: "inv-global-2",
            query: "Tema 2",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            findings: [],
            blockedSources: [],
          },
        },
      }),
    );

    expect(receivedInvestigationIds).toEqual(["inv-global-1", "inv-global-2"]);
  });
});
