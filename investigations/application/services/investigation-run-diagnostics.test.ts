import { describe, expect, it } from "bun:test";

import {
  buildFinalInvestigationReport,
  buildRunSummary,
  InMemoryInvestigationRunDiagnosticsStore,
} from "@/investigations/application/services/investigation-run-diagnostics";

describe("InMemoryInvestigationRunDiagnosticsStore", () => {
  it("keeps a ring buffer with latest events per run", () => {
    const store = new InMemoryInvestigationRunDiagnosticsStore(3);

    store.record({
      runId: "run-1",
      investigationId: "inv-1",
      round: 1,
      node: "worker_1",
      workerId: "researcher-1",
      stage: "reserve",
      result: "ok",
      errorCode: null,
      shortMessage: "evento-1",
    });
    store.record({
      runId: "run-1",
      investigationId: "inv-1",
      round: 1,
      node: "worker_1",
      workerId: "researcher-1",
      stage: "scrape",
      result: "error",
      errorCode: "INTEGRATION_TIMEOUT",
      shortMessage: "evento-2",
    });
    store.record({
      runId: "run-1",
      investigationId: "inv-1",
      round: 1,
      node: "worker_2",
      workerId: "researcher-2",
      stage: "reserve",
      result: "skip",
      errorCode: null,
      shortMessage: "evento-3",
    });
    store.record({
      runId: "run-1",
      investigationId: "inv-1",
      round: 2,
      node: "worker_3",
      workerId: "researcher-3",
      stage: "extract",
      result: "error",
      errorCode: "INTEGRATION_AUTH",
      shortMessage: "evento-4",
    });

    const snapshot = store.getRunDiagnostics({ investigationId: "inv-1", runId: "run-1" });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.events).toHaveLength(3);
    expect(snapshot?.events[0]?.shortMessage).toBe("evento-2");
    expect(snapshot?.events[2]?.shortMessage).toBe("evento-4");
  });
});

describe("buildRunSummary", () => {
  it("computes productive workers, failed workers and top failure reasons", () => {
    const summary = buildRunSummary({
      runId: "run-22",
      totalWorkers: 3,
      findingsCount: 0,
      terminationReason: "no_progress",
      events: [
        {
          timestamp: "2026-03-30T12:00:00.000Z",
          runId: "run-22",
          investigationId: "inv-22",
          round: 1,
          node: "worker_1",
          workerId: "researcher-1",
          stage: "scrape",
          result: "error",
          errorCode: "INTEGRATION_TIMEOUT",
          shortMessage: "scrape timeout",
        },
        {
          timestamp: "2026-03-30T12:00:01.000Z",
          runId: "run-22",
          investigationId: "inv-22",
          round: 1,
          node: "worker_2",
          workerId: "researcher-2",
          stage: "extract",
          result: "error",
          errorCode: "INTEGRATION_AUTH",
          shortMessage: "extract auth",
        },
        {
          timestamp: "2026-03-30T12:00:02.000Z",
          runId: "run-22",
          investigationId: "inv-22",
          round: 1,
          node: "worker_3",
          workerId: "researcher-3",
          stage: "persist",
          result: "ok",
          errorCode: null,
          shortMessage: "persist ok",
        },
        {
          timestamp: "2026-03-30T12:00:03.000Z",
          runId: "run-22",
          investigationId: "inv-22",
          round: 2,
          node: "worker_3",
          workerId: "researcher-3",
          stage: "scrape",
          result: "error",
          errorCode: "INTEGRATION_TIMEOUT",
          shortMessage: "later scrape timeout",
        },
      ],
    });

    expect(summary.totalWorkers).toBe(3);
    expect(summary.productiveWorkers).toBe(1);
    expect(summary.failedWorkers).toBe(2);
    expect(summary.findingsCount).toBe(0);
    expect(summary.terminationReason).toBe("no_progress");
    expect(summary.urlsReservedTotal).toBe(0);
    expect(summary.urlsProcessedTotal).toBe(1);
    expect(summary.urlsFailedTotal).toBe(3);
    expect(summary.findingsCreatedTotal).toBe(1);
    expect(summary.findingsPerRound).toEqual([1]);
    expect(summary.termination_reason).toBe("no_progress");
    expect(summary.urls_reserved_total).toBe(0);
    expect(summary.urls_processed_total).toBe(1);
    expect(summary.urls_failed_total).toBe(3);
    expect(summary.findings_created_total).toBe(1);
    expect(summary.findings_per_round).toEqual([1]);
    expect(summary.topFailureReasons.some((item) => item.errorCode === "INTEGRATION_AUTH")).toBeTrue();
    expect(summary.topFailureReasons.some((item) => item.errorCode === "INTEGRATION_TIMEOUT")).toBeTrue();
    expect(summary.quality.uniqueDomainsCount).toBe(0);
    expect(summary.quality.urlsDiscardedByQuality).toBe(0);
  });

  it("includes quality metrics in run summary", () => {
    const summary = buildRunSummary({
      runId: "run-quality",
      totalWorkers: 3,
      findingsCount: 2,
      terminationReason: "max_rounds",
      events: [],
      qualityInput: {
        domainCounts: {
          "example.com": 3,
          "reuters.com": 1,
        },
        discardedByReason: {
          LOW_TEXT_CONTENT: 2,
          NON_INFORMATIVE_FINDING: 1,
        },
      },
    });

    expect(summary.quality.uniqueDomainsCount).toBe(2);
    expect(summary.quality.topDomain).toBe("example.com");
    expect(summary.quality.topDomainShare).toBe(0.75);
    expect(summary.quality.urlsDiscardedByQuality).toBe(3);
    expect(summary.quality.discardedByReason[0]?.reason).toBe("LOW_TEXT_CONTENT");
  });

  it("builds final structured report with coverage and synthesis", () => {
    const report = buildFinalInvestigationReport({
      runId: "run-structured",
      totalWorkers: 3,
      findingsCount: 2,
      terminationReason: "max_rounds",
      roundsExecuted: 4,
      status: "completed",
      events: [
        {
          timestamp: "2026-03-30T12:00:00.000Z",
          runId: "run-structured",
          investigationId: "inv-structured",
          round: 1,
          node: "worker_1",
          workerId: "researcher-1",
          stage: "reserve",
          result: "ok",
          errorCode: null,
          shortMessage: "reserved",
        },
        {
          timestamp: "2026-03-30T12:00:01.000Z",
          runId: "run-structured",
          investigationId: "inv-structured",
          round: 1,
          node: "worker_1",
          workerId: "researcher-1",
          stage: "persist",
          result: "ok",
          errorCode: null,
          shortMessage: "persist ok",
        },
      ],
      workerReports: [
        {
          workerId: "researcher-1",
          round: 1,
          node: "worker_1",
          status: "processed",
          findingCreated: true,
          processedUrl: "https://example.com/1",
          errorCode: null,
          note: "ok",
        },
        {
          workerId: "researcher-2",
          round: 1,
          node: "worker_2",
          status: "idle",
          findingCreated: false,
          processedUrl: null,
          errorCode: null,
          note: "idle",
        },
      ],
      keyFindings: [
        {
          id: "f-1",
          title: "Finding 1",
          sourceUrl: "https://example.com/1",
          confidence: "high",
          summary: "summary",
        },
      ],
    });

    expect(report.runId).toBe("run-structured");
    expect(report.executiveSummary).toContain("2 findings");
    expect(report.agentReports).toHaveLength(2);
    expect(report.keyFindings).toHaveLength(1);
    expect(report.coverage.totalWorkers).toBe(3);
    expect(report.coverage.workersReported).toBe(2);
    expect(report.coverage.productiveWorkers).toBe(1);
    expect(report.coverage.idleWorkers).toBe(1);
    expect(report.coverage.findingsCoverageRatio).toBe(1);
    expect(report.termination.status).toBe("completed");
    expect(report.termination.reason).toBe("max_rounds");
    expect(report.termination.roundsExecuted).toBe(4);
    expect(report.keyGaps).toHaveLength(0);
    expect(report.quality.urlsDiscardedByQuality).toBe(0);
  });

  it("includes key gaps and quality metrics in final report", () => {
    const report = buildFinalInvestigationReport({
      runId: "run-gaps",
      totalWorkers: 2,
      findingsCount: 1,
      terminationReason: "queue_exhausted",
      roundsExecuted: 2,
      status: "completed",
      events: [],
      workerReports: [],
      keyFindings: [],
      keyGaps: ["Falta dataset historico", "Falta dataset historico", "Sin trazabilidad oficial"],
      qualityInput: {
        domainCounts: { "foo.com": 2 },
        discardedByReason: { BOILERPLATE_CONTENT: 4 },
      },
    });

    expect(report.keyGaps).toEqual(["Falta dataset historico", "Sin trazabilidad oficial"]);
    expect(report.quality.topDomain).toBe("foo.com");
    expect(report.quality.urlsDiscardedByQuality).toBe(4);
  });
});
