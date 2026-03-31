import { describe, expect, it } from "bun:test";

import { parseInvestigationStreamMessage } from "@/investigations/interfaces/web/investigation-stream-parser";

describe("parseInvestigationStreamMessage", () => {
  it("parses strict-v2 envelope", () => {
    const parsed = parseInvestigationStreamMessage({
      eventType: "investigation.finding_added",
      data: JSON.stringify({
        version: "v2",
        emittedAt: "2026-03-29T10:00:00.000Z",
        data: {
          type: "investigation.finding_added",
          occurredAt: "2026-03-29T09:59:59.000Z",
          payload: {
            findingId: "f-1",
          },
        },
      }),
    });

    expect(parsed.type).toBe("investigation.finding_added");
    expect(parsed.timestamp).toBe("2026-03-29T09:59:59.000Z");
    expect(parsed.payloadSummary).toContain("findingId");
  });

  it("supports legacy duplicated payload without breaking UX", () => {
    const parsed = parseInvestigationStreamMessage({
      eventType: "investigation.finding_added",
      data: JSON.stringify({
        version: "v2",
        emittedAt: "2026-03-29T10:00:00.000Z",
        data: {
          type: "investigation.finding_added",
          occurredAt: "2026-03-29T09:59:59.000Z",
          payload: {
            findingId: "f-1",
          },
        },
        type: "investigation.finding_added",
        occurredAt: "2026-03-29T09:59:58.000Z",
        payload: {
          findingId: "legacy-fallback",
        },
      }),
    });

    expect(parsed.type).toBe("investigation.finding_added");
    expect(parsed.timestamp).toBe("2026-03-29T09:59:59.000Z");
    expect(parsed.payloadSummary).toContain("findingId");
  });

  it("falls back to raw message when data is not JSON", () => {
    const parsed = parseInvestigationStreamMessage({
      eventType: "investigation.stream_state",
      data: "plain text payload",
    });

    expect(parsed.type).toBe("investigation.stream_state");
    expect(parsed.payloadSummary).toContain("plain text payload");
  });

  it("parses structured final_report_ready envelope payload", () => {
    const parsed = parseInvestigationStreamMessage({
      eventType: "investigation.final_report_ready",
      data: JSON.stringify({
        version: "v2",
        emittedAt: "2026-03-30T12:00:00.000Z",
        data: {
          type: "investigation.final_report_ready",
          occurredAt: "2026-03-30T11:59:59.000Z",
          payload: {
            runId: "run-abc",
            executiveSummary: "Resumen final",
            coverage: { workersReported: 3 },
          },
        },
      }),
    });

    expect(parsed.type).toBe("investigation.final_report_ready");
    expect(parsed.timestamp).toBe("2026-03-30T11:59:59.000Z");
    expect(parsed.payloadSummary).toContain("executiveSummary");
  });
});
