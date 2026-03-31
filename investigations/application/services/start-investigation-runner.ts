import type { InvestigationAgentGraphRunner } from "@/investigations/application/services/investigation-agent-graph";
import { randomUUID } from "node:crypto";

export type StartInvestigationRunResult = {
  investigationId: string;
  runId: string;
  mode: "real";
  startedAt: string;
};

export class StartInvestigationRunner {
  constructor(private readonly graphRunner: InvestigationAgentGraphRunner) {}

  async execute(investigationId: string, runId = randomUUID()): Promise<StartInvestigationRunResult> {
    const startedAt = new Date().toISOString();
    await this.graphRunner.runInvestigation(investigationId, runId);

    return {
      investigationId,
      runId,
      mode: "real",
      startedAt,
    };
  }
}
