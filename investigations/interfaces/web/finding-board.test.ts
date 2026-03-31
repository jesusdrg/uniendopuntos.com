import { describe, expect, it } from "bun:test";

import type { FindingResponse, InvestigationStreamEvent } from "@/investigations/interfaces/web/contracts";
import {
  buildFindingBoardCards,
  buildFindingBoardConnections,
} from "@/investigations/interfaces/web/finding-board";

describe("buildFindingBoardCards", () => {
  it("maps initial findings with domain and timestamp", () => {
    const cards = buildFindingBoardCards(
      [
        {
          id: "f-1",
          title: "Contrato detectado",
          summary: "Resumen base",
          sourceUrl: "https://datos.gob.ar/contrato/123",
          createdAt: "2026-03-30T12:00:00.000Z",
        },
      ],
      [],
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.sourceDomain).toBe("datos.gob.ar");
    expect(cards[0]?.sourceType).toBe("fuente");
    expect(cards[0]?.timestamp).toBe("2026-03-30T12:00:00.000Z");
  });

  it("supports finding_added from strict-v2 and legacy type", () => {
    const events: InvestigationStreamEvent[] = [
      event("finding_added", {
        finding: {
          id: "f-2",
          title: "Nueva conexion",
          summary: "Llega por fallback legacy",
          sourceUrl: "https://example.org/doc",
          createdAt: "2026-03-30T12:02:00.000Z",
        },
      }, "2026-03-30T12:02:01.000Z"),
      event("investigation.finding_added", {
        finding: {
          id: "f-3",
          title: "Proveedor relacionado",
          summary: "Llega por v2",
          sourceUrl: "https://boletinoficial.gob.ar/nota",
          createdAt: "2026-03-30T12:03:00.000Z",
        },
      }, "2026-03-30T12:03:01.000Z"),
    ];

    const cards = buildFindingBoardCards([], events);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.id).toBe("f-3");
    expect(cards[1]?.id).toBe("f-2");
  });

  it("upserts by id and keeps latest timestamp first", () => {
    const initial: FindingResponse[] = [
      {
        id: "f-1",
        title: "Titulo viejo",
        summary: "Resumen viejo",
        sourceUrl: "https://old.example.com/a",
        createdAt: "2026-03-30T11:00:00.000Z",
      },
    ];

    const events: InvestigationStreamEvent[] = [
      event("investigation.finding_added", {
        finding: {
          id: "f-1",
          title: "Titulo actualizado",
          summary: "Resumen nuevo",
          sourceUrl: "https://new.example.com/b",
          createdAt: "2026-03-30T12:00:00.000Z",
        },
      }, "2026-03-30T12:00:01.000Z"),
      event("investigation.finding_added", {
        finding: {
          id: "f-2",
          title: "Otro finding",
          summary: "Texto",
          sourceUrl: "https://docs.example.net/c",
          createdAt: "2026-03-30T11:30:00.000Z",
        },
      }, "2026-03-30T11:30:01.000Z"),
    ];

    const cards = buildFindingBoardCards(initial, events);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.id).toBe("f-1");
    expect(cards[0]?.title).toBe("Titulo actualizado");
    expect(cards[0]?.sourceDomain).toBe("new.example.com");
  });

  it("prioritizes semantic edges and keeps timeline fallback for isolated nodes", () => {
    const events: InvestigationStreamEvent[] = [
      event("investigation.finding_added", {
        finding: {
          id: "f-1",
          title: "Origen",
          summary: "base",
          sourceUrl: "https://example.com/1",
          createdAt: "2026-03-30T10:00:00.000Z",
        },
      }, "2026-03-30T10:00:01.000Z"),
      event("investigation.finding_added", {
        finding: {
          id: "f-2",
          title: "Relacionado",
          summary: "depende de f-1",
          sourceUrl: "https://example.com/2",
          createdAt: "2026-03-30T10:01:00.000Z",
          relatedFindingId: "f-1",
        },
      }, "2026-03-30T10:01:01.000Z"),
      event("investigation.finding_added", {
        finding: {
          id: "f-3",
          title: "Secuencia",
          summary: "sin relacion",
          sourceUrl: "https://blog.example.com/3",
          createdAt: "2026-03-30T10:02:00.000Z",
        },
      }, "2026-03-30T10:02:01.000Z"),
    ];

    const connections = buildFindingBoardConnections([], events);

    expect(connections).toHaveLength(2);
    expect(
      connections.some((edge) => edge.fromId === "f-1" && edge.toId === "f-2" && edge.reason === "semantic"),
    ).toBeTrue();
    expect(
      connections.some((edge) => edge.fromId === "f-2" && edge.toId === "f-3" && edge.reason === "timeline_fallback"),
    ).toBeTrue();
  });

  it("uses semantic SSE connection updates and only falls back timeline for isolated nodes", () => {
    const events: InvestigationStreamEvent[] = [
      event("investigation.finding_connections_updated", {
        connections: [
          {
            id: "f-1<->f-2",
            fromId: "f-1",
            toId: "f-2",
            score: 0.8,
            reason: "shared_claims:1",
          },
        ],
      }, "2026-03-30T10:03:00.000Z"),
    ];

    const initialFindings: FindingResponse[] = [
      {
        id: "f-1",
        title: "A",
        summary: "Uno",
        sourceUrl: "https://example.com/1",
        createdAt: "2026-03-30T10:00:00.000Z",
      },
      {
        id: "f-2",
        title: "B",
        summary: "Dos",
        sourceUrl: "https://example.com/2",
        createdAt: "2026-03-30T10:01:00.000Z",
      },
      {
        id: "f-3",
        title: "C",
        summary: "Tres",
        sourceUrl: "https://example.com/3",
        createdAt: "2026-03-30T10:02:00.000Z",
      },
    ];

    const connections = buildFindingBoardConnections(initialFindings, events);

    expect(connections.some((edge) => edge.fromId === "f-1" && edge.toId === "f-2" && edge.reason === "semantic")).toBeTrue();
    expect(
      connections.some((edge) => edge.fromId === "f-2" && edge.toId === "f-3" && edge.reason === "timeline_fallback"),
    ).toBeTrue();
    expect(connections.some((edge) => edge.fromId === "f-1" && edge.toId === "f-3")).toBeFalse();
  });

  it("supports legacy findings without semantic hints", () => {
    const initialFindings: FindingResponse[] = [
      {
        id: "legacy-1",
        title: "Legacy 1",
        summary: "Sin hints",
        sourceUrl: "https://legacy.example/1",
        createdAt: "2026-03-30T09:00:00.000Z",
      },
      {
        id: "legacy-2",
        title: "Legacy 2",
        summary: "Sin hints",
        sourceUrl: "https://legacy.example/2",
        createdAt: "2026-03-30T09:01:00.000Z",
      },
    ];

    const connections = buildFindingBoardConnections(initialFindings, []);

    expect(connections).toHaveLength(1);
    expect(connections[0]?.reason).toBe("timeline_fallback");
  });
});

function event(type: string, payload: unknown, timestamp: string): InvestigationStreamEvent {
  return {
    type,
    timestamp,
    payloadSummary: "payload",
    rawPayload: payload,
  };
}
