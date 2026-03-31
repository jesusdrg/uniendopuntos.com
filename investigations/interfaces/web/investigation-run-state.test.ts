import { describe, expect, it } from "bun:test";

import { buildRunState, shouldShowFinalReport } from "@/investigations/interfaces/web/investigation-run-state";
import type { InvestigationStreamEvent } from "@/investigations/interfaces/web/contracts";

describe("buildRunState", () => {
  it("returns idle state when there are no events", () => {
    const state = buildRunState([]);

    expect(state.status).toBe("idle");
    expect(state.runId).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.endedAt).toBeNull();
    expect(state.summaryMessage).toBe("Aun no iniciada");
    expect(state.runSummary).toBeNull();
    expect(state.finalReport).toBeNull();
  });

  it("maps start and progress events to running state", () => {
    const events = [
      event("investigation.run_progress", {
        runId: "run-1",
        round: 2,
        maxRounds: 4,
        processedWorkers: 3,
        failedWorkers: 1,
      }, "2026-03-30T12:01:00.000Z"),
      event("investigation.run_started", {
        runId: "run-1",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.status).toBe("running");
    expect(state.runId).toBe("run-1");
    expect(state.startedAt).toBe("2026-03-30T12:00:00.000Z");
    expect(state.endedAt).toBeNull();
    expect(state.progress.round).toBe(2);
    expect(state.progress.maxRounds).toBe(4);
    expect(state.progress.processedWorkers).toBe(3);
    expect(state.progress.failedWorkers).toBe(1);
    expect(state.summaryMessage).toBe("Corrida en ejecucion");
  });

  it("maps completion events with summary", () => {
    const events = [
      event("investigation.run_completed", {
        runId: "run-2",
        completedAt: "2026-03-30T12:05:00.000Z",
        summary: "Investigacion finalizada con 8 findings.",
      }, "2026-03-30T12:05:00.000Z"),
      event("investigation.run_started", {
        runId: "run-2",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.status).toBe("completed");
    expect(state.runId).toBe("run-2");
    expect(state.startedAt).toBe("2026-03-30T12:00:00.000Z");
    expect(state.endedAt).toBe("2026-03-30T12:05:00.000Z");
    expect(state.summaryMessage).toContain("8 findings");
  });

  it("maps failed events and keeps progress", () => {
    const events = [
      event("investigation.run_failed", {
        runId: "run-3",
        failedAt: "2026-03-30T12:03:00.000Z",
        message: "Timeout en provider",
      }, "2026-03-30T12:03:00.000Z"),
      event("investigation.run_progress", {
        runId: "run-3",
        round: 1,
        maxRounds: 4,
        processedWorkers: 1,
        failedWorkers: 2,
      }, "2026-03-30T12:02:00.000Z"),
      event("investigation.run_started", {
        runId: "run-3",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.status).toBe("failed");
    expect(state.runId).toBe("run-3");
    expect(state.startedAt).toBe("2026-03-30T12:00:00.000Z");
    expect(state.endedAt).toBe("2026-03-30T12:03:00.000Z");
    expect(state.progress.round).toBe(1);
    expect(state.progress.maxRounds).toBe(4);
    expect(state.progress.processedWorkers).toBe(1);
    expect(state.progress.failedWorkers).toBe(2);
    expect(state.summaryMessage).toBe("Timeout en provider");
  });

  it("maps run_summary event for 0 findings diagnostics", () => {
    const events = [
      event("investigation.run_summary", {
        runId: "run-4",
        totalWorkers: 3,
        productiveWorkers: 0,
        failedWorkers: 3,
        findingsCount: 0,
        terminationReason: "queue_exhausted",
        urlsReservedTotal: 4,
        urlsProcessedTotal: 0,
        urlsFailedTotal: 3,
        findingsCreatedTotal: 0,
        findingsPerRound: [0, 0],
        topFailureReasons: [
          { errorCode: "INTEGRATION_TIMEOUT", count: 2 },
          { errorCode: "INTEGRATION_AUTH", count: 1 },
        ],
        quality: {
          uniqueDomainsCount: 2,
          topDomain: "example.com",
          topDomainShare: 0.5,
          urlsDiscardedByQuality: 3,
          discardedByReason: [{ reason: "LOW_TEXT_CONTENT", count: 3 }],
        },
      }, "2026-03-30T12:04:00.000Z"),
      event("investigation.run_completed", {
        runId: "run-4",
        completedAt: "2026-03-30T12:05:00.000Z",
        summary: "Investigacion finalizada con 0 findings.",
      }, "2026-03-30T12:05:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.status).toBe("completed");
    expect(state.runSummary).not.toBeNull();
    expect(state.runSummary?.findingsCount).toBe(0);
    expect(state.runSummary?.failedWorkers).toBe(3);
    expect(state.runSummary?.terminationReason).toBe("queue_exhausted");
    expect(state.runSummary?.urlsReservedTotal).toBe(4);
    expect(state.runSummary?.urlsProcessedTotal).toBe(0);
    expect(state.runSummary?.urlsFailedTotal).toBe(3);
    expect(state.runSummary?.topFailureReasons[0]?.errorCode).toBe("INTEGRATION_TIMEOUT");
  });

  it("accumulates worker_reported and then overwrites with final_report_ready", () => {
    const events = [
      event("investigation.final_report_ready", {
        runId: "run-structured",
        executiveSummary: "Resumen final unificado",
        agentReports: [
          {
            workerId: "researcher-1",
            round: 2,
            node: "worker_1",
            status: "processed",
            findingCreated: true,
            processedUrl: "https://example.com/ok",
            errorCode: null,
            note: "ok",
          },
        ],
        keyFindings: [
          {
            id: "f-1",
            title: "Finding",
            sourceUrl: "https://example.com/ok",
            confidence: "high",
            summary: "summary",
          },
        ],
        coverage: {
          totalWorkers: 3,
          workersReported: 3,
          productiveWorkers: 1,
          failedWorkers: 1,
          idleWorkers: 1,
          urlsReservedTotal: 6,
          urlsProcessedTotal: 2,
          urlsFailedTotal: 1,
          findingsCreatedTotal: 2,
          findingsCoverageRatio: 0.3333,
        },
        termination: {
          status: "completed",
          reason: "max_rounds",
          roundsExecuted: 2,
        },
        topFailureReasons: [{ errorCode: "INTEGRATION_TIMEOUT", count: 1 }],
        quality: {
          uniqueDomainsCount: 3,
          topDomain: "example.com",
          topDomainShare: 0.3333,
          urlsDiscardedByQuality: 1,
          discardedByReason: [{ reason: "NON_INFORMATIVE_FINDING", count: 1 }],
        },
        keyGaps: ["Falta documentacion contractual"],
      }, "2026-03-30T12:06:00.000Z"),
      event("investigation.worker_reported", {
        runId: "run-structured",
        report: {
          workerId: "researcher-1",
          round: 1,
          node: "worker_1",
          status: "idle",
          findingCreated: false,
          processedUrl: null,
          errorCode: null,
          note: "idle",
        },
      }, "2026-03-30T12:05:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.finalReport).not.toBeNull();
    expect(state.finalReport?.executiveSummary).toBe("Resumen final unificado");
    expect(state.finalReport?.agentReports).toHaveLength(1);
    expect(state.finalReport?.agentReports[0]?.status).toBe("processed");
    expect(state.finalReport?.termination.reason).toBe("max_rounds");
  });

  it("supports legacy run_* event names without namespace", () => {
    const events = [
      event("run_progress", {
        runId: "run-legacy",
        round: 1,
        maxRounds: 3,
        processedWorkers: 2,
        failedWorkers: 0,
      }, "2026-03-30T12:01:00.000Z"),
      event("run_started", {
        runId: "run-legacy",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ];

    const state = buildRunState(events);

    expect(state.status).toBe("running");
    expect(state.runId).toBe("run-legacy");
    expect(state.progress.round).toBe(1);
    expect(state.progress.maxRounds).toBe(3);
  });

  it("shows final report for finished runs or when structured report exists", () => {
    const idle = buildRunState([]);
    const running = buildRunState([
      event("investigation.run_started", {
        runId: "run-live",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ]);
    const completed = buildRunState([
      event("investigation.run_completed", {
        runId: "run-done",
        completedAt: "2026-03-30T12:10:00.000Z",
        summary: "ok",
      }, "2026-03-30T12:10:00.000Z"),
    ]);
    const failed = buildRunState([
      event("investigation.run_failed", {
        runId: "run-fail",
        failedAt: "2026-03-30T12:11:00.000Z",
        message: "boom",
      }, "2026-03-30T12:11:00.000Z"),
    ]);
    const runningWithFinalReport = buildRunState([
      event("investigation.final_report_ready", {
        runId: "run-live-with-report",
        executiveSummary: "partial",
        agentReports: [],
        keyFindings: [],
        coverage: {
          totalWorkers: 1,
          workersReported: 0,
          productiveWorkers: 0,
          failedWorkers: 0,
          idleWorkers: 1,
          urlsReservedTotal: 0,
          urlsProcessedTotal: 0,
          urlsFailedTotal: 0,
          findingsCreatedTotal: 0,
          findingsCoverageRatio: 0,
        },
        termination: {
          status: "completed",
          reason: "no_progress",
          roundsExecuted: 0,
        },
        topFailureReasons: [],
        quality: {
          uniqueDomainsCount: 0,
          topDomain: null,
          topDomainShare: 0,
          urlsDiscardedByQuality: 0,
          discardedByReason: [],
        },
        keyGaps: [],
      }, "2026-03-30T12:08:00.000Z"),
      event("investigation.run_started", {
        runId: "run-live-with-report",
        startedAt: "2026-03-30T12:00:00.000Z",
      }, "2026-03-30T12:00:00.000Z"),
    ]);

    expect(shouldShowFinalReport(idle)).toBeFalse();
    expect(shouldShowFinalReport(running)).toBeFalse();
    expect(shouldShowFinalReport(completed)).toBeTrue();
    expect(shouldShowFinalReport(failed)).toBeTrue();
    expect(shouldShowFinalReport(runningWithFinalReport)).toBeTrue();
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
