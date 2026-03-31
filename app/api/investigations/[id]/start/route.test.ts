import { describe, expect, it } from "bun:test";

import { POST } from "@/app/api/investigations/[id]/start/route";
import {
  createInvestigationUseCase,
  investigationRuntimeConfigError,
  investigationRunJobs,
} from "@/investigations/interfaces/http/dependencies";

describe("POST /api/investigations/[id]/start", () => {
  it("starts an investigation run and returns accepted", async () => {
    const created = await createInvestigationUseCase.execute({ query: "flujo start slice 2" });

    const response = await POST(
      new Request(`http://localhost/api/investigations/${created.id}/start`, {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: created.id }),
      },
    );

    const payload = (await response.json()) as {
      investigationId: string;
      runId?: string;
      startedAt?: string;
      reason?: string;
      status: string;
      mode: string;
      error?: { code?: string };
    };

    if (investigationRunJobs) {
      expect(response.status).toBe(202);
      expect(payload.investigationId).toBe(created.id);
      expect(["started", "already_running"]).toContain(payload.status);
      expect(payload.mode).toBe("real");
      expect(payload.runId).toBeString();
      expect(payload.startedAt).toBeString();
      return;
    }

    if (investigationRuntimeConfigError) {
      expect(response.status).toBeGreaterThanOrEqual(401);
      expect(response.status).toBeLessThanOrEqual(504);
      expect(payload.error?.code?.startsWith("INTEGRATION_")).toBeTrue();
      return;
    }

    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe("INVESTIGATION_RUNNER_UNAVAILABLE");
  });
});
