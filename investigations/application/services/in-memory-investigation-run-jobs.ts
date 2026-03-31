import type { StartInvestigationRunner } from "@/investigations/application/services/start-investigation-runner";
import { randomUUID } from "node:crypto";

import { logInvestigationRun } from "@/investigations/infrastructure/observability/structured-logger";

type RunJob = {
  investigationId: string;
  runId: string;
  startedAt: string;
  promise: Promise<void>;
};

export class InMemoryInvestigationRunJobs {
  private readonly jobsByInvestigationId = new Map<string, RunJob>();

  constructor(private readonly startRunner: StartInvestigationRunner) {}

  start(investigationId: string): {
    accepted: boolean;
    runId: string;
    startedAt: string;
    reason?: "already_running";
  } {
    const existing = this.jobsByInvestigationId.get(investigationId);

    if (existing) {
      return {
        accepted: false,
        runId: existing.runId,
        startedAt: existing.startedAt,
        reason: "already_running",
      };
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();

    const promise = this.startRunner
      .execute(investigationId, runId)
      .then(() => {
        this.jobsByInvestigationId.delete(investigationId);
      })
      .catch((error: unknown) => {
        logInvestigationRun({
          requestId: runId,
          route: "investigation-run-jobs",
          methodOrEvent: "run.fail",
          statusOrResult: "failed",
          durationMs: 0,
          errorCode: "INVESTIGATION_RUN_JOB_FAILED",
          metadata: {
            investigationId,
            runId,
            message: error instanceof Error ? error.message : "Unknown run job error",
          },
        });
        this.jobsByInvestigationId.delete(investigationId);
      });

    this.jobsByInvestigationId.set(investigationId, {
      investigationId,
      runId,
      startedAt,
      promise,
    });

    return {
      accepted: true,
      runId,
      startedAt,
    };
  }
}
