import { describe, expect, it } from "bun:test";

import { GET } from "@/app/api/investigations/[id]/runs/[runId]/diagnostics/route";
import { investigationRunDiagnostics } from "@/investigations/interfaces/http/dependencies";

describe("GET /api/investigations/[id]/runs/[runId]/diagnostics", () => {
  it("returns diagnostics snapshot for existing run", async () => {
    investigationRunDiagnostics.record({
      runId: "run-diag-1",
      investigationId: "inv-diag-1",
      round: 1,
      node: "worker_1",
      workerId: "researcher-1",
      stage: "scrape",
      result: "error",
      errorCode: "INTEGRATION_TIMEOUT",
      shortMessage: "Timeout en playwright",
    });

    const response = await GET(
      new Request("http://localhost/api/investigations/inv-diag-1/runs/run-diag-1/diagnostics"),
      {
        params: Promise.resolve({ id: "inv-diag-1", runId: "run-diag-1" }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      runId: string;
      investigationId: string;
      latestWorkerErrors: Array<{ workerId: string; errorCode: string }>;
      events: Array<{ stage: string }>;
    };

    expect(payload.runId).toBe("run-diag-1");
    expect(payload.investigationId).toBe("inv-diag-1");
    expect(payload.latestWorkerErrors[0]?.workerId).toBe("researcher-1");
    expect(payload.latestWorkerErrors[0]?.errorCode).toBe("INTEGRATION_TIMEOUT");
    expect(payload.events[0]?.stage).toBe("scrape");
  });

  it("returns 404 when run diagnostics does not exist", async () => {
    const response = await GET(
      new Request("http://localhost/api/investigations/inv-diag-missing/runs/run-missing/diagnostics"),
      {
        params: Promise.resolve({ id: "inv-diag-missing", runId: "run-missing" }),
      },
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as {
      error?: { code?: string };
    };
    expect(payload.error?.code).toBe("RUN_DIAGNOSTICS_NOT_FOUND");
  });
});
