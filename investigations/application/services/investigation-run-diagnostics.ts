export const DIAGNOSTIC_STAGES = ["search", "reserve", "scrape", "extract", "persist"] as const;
export const DIAGNOSTIC_RESULTS = ["ok", "error", "skip"] as const;

export type InvestigationDiagnosticStage = (typeof DIAGNOSTIC_STAGES)[number];
export type InvestigationDiagnosticResult = (typeof DIAGNOSTIC_RESULTS)[number];

export type InvestigationDiagnosticEvent = {
  timestamp: string;
  runId: string;
  investigationId: string;
  round: number;
  node: string;
  workerId: string | null;
  stage: InvestigationDiagnosticStage;
  result: InvestigationDiagnosticResult;
  errorCode: string | null;
  shortMessage: string;
};

export type RunFailureReason = {
  errorCode: string;
  count: number;
};

export type QualityReasonCount = {
  reason: string;
  count: number;
};

export type InvestigationRunQualityMetrics = {
  uniqueDomainsCount: number;
  topDomain: string | null;
  topDomainShare: number;
  urlsDiscardedByQuality: number;
  discardedByReason: QualityReasonCount[];
};

export type WorkerLatestError = {
  workerId: string;
  round: number;
  node: string;
  stage: InvestigationDiagnosticStage;
  errorCode: string;
  shortMessage: string;
  timestamp: string;
};

export type InvestigationRunSummary = {
  runId: string;
  totalWorkers: number;
  productiveWorkers: number;
  failedWorkers: number;
  findingsCount: number;
  terminationReason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
  urlsReservedTotal: number;
  urlsProcessedTotal: number;
  urlsFailedTotal: number;
  findingsCreatedTotal: number;
  findingsPerRound: number[];
  termination_reason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
  urls_reserved_total: number;
  urls_processed_total: number;
  urls_failed_total: number;
  findings_created_total: number;
  findings_per_round: number[];
  topFailureReasons: RunFailureReason[];
  quality: InvestigationRunQualityMetrics;
};

export type InvestigationWorkerReport = {
  workerId: string;
  round: number;
  node: string;
  status: "processed" | "idle" | "error";
  findingCreated: boolean;
  processedUrl: string | null;
  errorCode: string | null;
  note: string;
};

export type InvestigationKeyFinding = {
  id: string;
  title: string;
  sourceUrl: string;
  confidence: "low" | "medium" | "high" | "unknown";
  summary: string;
};

export type InvestigationFinalCoverage = {
  totalWorkers: number;
  workersReported: number;
  productiveWorkers: number;
  failedWorkers: number;
  idleWorkers: number;
  urlsReservedTotal: number;
  urlsProcessedTotal: number;
  urlsFailedTotal: number;
  findingsCreatedTotal: number;
  findingsCoverageRatio: number;
};

export type InvestigationFinalReport = {
  runId: string;
  executiveSummary: string;
  agentReports: InvestigationWorkerReport[];
  keyFindings: InvestigationKeyFinding[];
  coverage: InvestigationFinalCoverage;
  termination: {
    status: "completed" | "failed";
    reason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
    roundsExecuted: number;
  };
  topFailureReasons: RunFailureReason[];
  quality: InvestigationRunQualityMetrics;
  keyGaps: string[];
};

export type InvestigationRunDiagnosticsSnapshot = {
  runId: string;
  investigationId: string;
  summary: InvestigationRunSummary | null;
  latestWorkerErrors: WorkerLatestError[];
  events: InvestigationDiagnosticEvent[];
};

export interface InvestigationRunDiagnosticsStore {
  record(event: Omit<InvestigationDiagnosticEvent, "timestamp"> & { timestamp?: string }): InvestigationDiagnosticEvent;
  getRunDiagnostics(input: {
    investigationId: string;
    runId: string;
  }): InvestigationRunDiagnosticsSnapshot | null;
  updateRunSummary(input: {
    investigationId: string;
    runId: string;
    summary: InvestigationRunSummary;
  }): void;
}

type RunRecord = {
  summary: InvestigationRunSummary | null;
  events: InvestigationDiagnosticEvent[];
};

export class InMemoryInvestigationRunDiagnosticsStore implements InvestigationRunDiagnosticsStore {
  private readonly recordsByRunKey = new Map<string, RunRecord>();

  constructor(private readonly maxEventsPerRun = 120) {}

  record(
    event: Omit<InvestigationDiagnosticEvent, "timestamp"> & { timestamp?: string },
  ): InvestigationDiagnosticEvent {
    const normalized = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    } satisfies InvestigationDiagnosticEvent;
    const key = toRunKey(normalized.investigationId, normalized.runId);
    const current = this.recordsByRunKey.get(key) ?? {
      summary: null,
      events: [],
    };

    current.events.push(normalized);

    if (current.events.length > this.maxEventsPerRun) {
      current.events.splice(0, current.events.length - this.maxEventsPerRun);
    }

    this.recordsByRunKey.set(key, current);
    return normalized;
  }

  updateRunSummary(input: {
    investigationId: string;
    runId: string;
    summary: InvestigationRunSummary;
  }): void {
    const key = toRunKey(input.investigationId, input.runId);
    const current = this.recordsByRunKey.get(key) ?? {
      summary: null,
      events: [],
    };

    current.summary = input.summary;
    this.recordsByRunKey.set(key, current);
  }

  getRunDiagnostics(input: { investigationId: string; runId: string }): InvestigationRunDiagnosticsSnapshot | null {
    const key = toRunKey(input.investigationId, input.runId);
    const current = this.recordsByRunKey.get(key);

    if (!current) {
      return null;
    }

    return {
      runId: input.runId,
      investigationId: input.investigationId,
      summary: current.summary,
      latestWorkerErrors: collectLatestWorkerErrors(current.events),
      events: [...current.events],
    };
  }
}

export function buildRunSummary(input: {
  runId: string;
  totalWorkers: number;
  findingsCount: number;
  terminationReason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
  events: InvestigationDiagnosticEvent[];
  qualityInput?: {
    domainCounts: Record<string, number>;
    discardedByReason: Record<string, number>;
  };
}): InvestigationRunSummary {
  const productiveWorkers = new Set<string>();
  const workersWithErrors = new Set<string>();
  let urlsReservedTotal = 0;
  let urlsProcessedTotal = 0;
  let urlsFailedTotal = 0;
  const findingsPerRound = new Map<number, number>();

  for (const event of input.events) {
    if (event.workerId && event.stage === "persist" && event.result === "ok") {
      productiveWorkers.add(event.workerId);
    }

    if (event.workerId && event.result === "error") {
      workersWithErrors.add(event.workerId);
    }

    if (event.stage === "reserve" && event.result === "ok") {
      urlsReservedTotal += 1;
    }

    if (event.stage === "persist" && event.result === "ok") {
      urlsProcessedTotal += 1;
      findingsPerRound.set(event.round, (findingsPerRound.get(event.round) ?? 0) + 1);
    }

    if ((event.stage === "scrape" || event.stage === "extract" || event.stage === "persist") && event.result === "error") {
      urlsFailedTotal += 1;
    }
  }

  let failedWorkers = 0;
  for (const workerId of workersWithErrors) {
    if (!productiveWorkers.has(workerId)) {
      failedWorkers += 1;
    }
  }

  const quality = buildQualityMetrics(input.qualityInput);

  return {
    runId: input.runId,
    totalWorkers: Math.max(0, Math.trunc(input.totalWorkers)),
    productiveWorkers: productiveWorkers.size,
    failedWorkers,
    findingsCount: Math.max(0, Math.trunc(input.findingsCount)),
    terminationReason: input.terminationReason,
    urlsReservedTotal,
    urlsProcessedTotal,
    urlsFailedTotal,
    findingsCreatedTotal: urlsProcessedTotal,
    findingsPerRound: mapFindingsPerRound(findingsPerRound),
    termination_reason: input.terminationReason,
    urls_reserved_total: urlsReservedTotal,
    urls_processed_total: urlsProcessedTotal,
    urls_failed_total: urlsFailedTotal,
    findings_created_total: urlsProcessedTotal,
    findings_per_round: mapFindingsPerRound(findingsPerRound),
    topFailureReasons: collectTopFailureReasons(collectLatestWorkerErrors(input.events)),
    quality,
  };
}

export function buildFinalInvestigationReport(input: {
  runId: string;
  totalWorkers: number;
  findingsCount: number;
  terminationReason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
  roundsExecuted: number;
  status: "completed" | "failed";
  events: InvestigationDiagnosticEvent[];
  workerReports: InvestigationWorkerReport[];
  keyFindings: InvestigationKeyFinding[];
  keyGaps?: string[];
  qualityInput?: {
    domainCounts: Record<string, number>;
    discardedByReason: Record<string, number>;
  };
}): InvestigationFinalReport {
  const runSummary = buildRunSummary({
    runId: input.runId,
    totalWorkers: input.totalWorkers,
    findingsCount: input.findingsCount,
    terminationReason: input.terminationReason,
    events: input.events,
    qualityInput: input.qualityInput,
  });

  const workersReported = input.workerReports.length;
  const idleWorkers = input.workerReports.filter((item) => item.status === "idle").length;
  const findingsCoverageRatio =
    runSummary.urlsReservedTotal > 0
      ? Number((runSummary.findingsCreatedTotal / runSummary.urlsReservedTotal).toFixed(4))
      : 0;

  return {
    runId: input.runId,
    executiveSummary: buildExecutiveSummary({
      findingsCount: input.findingsCount,
      productiveWorkers: runSummary.productiveWorkers,
      failedWorkers: runSummary.failedWorkers,
      totalWorkers: input.totalWorkers,
      terminationReason: input.terminationReason,
    }),
    agentReports: [...input.workerReports],
    keyFindings: [...input.keyFindings],
    coverage: {
      totalWorkers: Math.max(0, Math.trunc(input.totalWorkers)),
      workersReported,
      productiveWorkers: runSummary.productiveWorkers,
      failedWorkers: runSummary.failedWorkers,
      idleWorkers,
      urlsReservedTotal: runSummary.urlsReservedTotal,
      urlsProcessedTotal: runSummary.urlsProcessedTotal,
      urlsFailedTotal: runSummary.urlsFailedTotal,
      findingsCreatedTotal: runSummary.findingsCreatedTotal,
      findingsCoverageRatio,
    },
    termination: {
      status: input.status,
      reason: input.terminationReason,
      roundsExecuted: Math.max(0, Math.trunc(input.roundsExecuted)),
    },
    topFailureReasons: runSummary.topFailureReasons,
    quality: runSummary.quality,
    keyGaps: normalizeGaps(input.keyGaps),
  };
}

function buildExecutiveSummary(input: {
  findingsCount: number;
  productiveWorkers: number;
  failedWorkers: number;
  totalWorkers: number;
  terminationReason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
}): string {
  return [
    `Investigacion cerrada con ${Math.max(0, Math.trunc(input.findingsCount))} findings.`,
    `Workers productivos: ${input.productiveWorkers}/${Math.max(0, Math.trunc(input.totalWorkers))}.`,
    `Workers fallidos: ${input.failedWorkers}.`,
    `Causa de cierre: ${input.terminationReason}.`,
  ].join(" ");
}

function mapFindingsPerRound(findingsPerRound: Map<number, number>): number[] {
  const rounds = [...findingsPerRound.keys()].sort((left, right) => left - right);
  const output: number[] = [];

  for (const round of rounds) {
    const count = findingsPerRound.get(round);
    if (typeof count === "number" && count > 0) {
      output.push(count);
    }
  }

  return output;
}

function collectLatestWorkerErrors(events: InvestigationDiagnosticEvent[]): WorkerLatestError[] {
  const errorsByWorker = new Map<string, WorkerLatestError>();

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event.workerId || event.result !== "error") {
      continue;
    }

    if (errorsByWorker.has(event.workerId)) {
      continue;
    }

    errorsByWorker.set(event.workerId, {
      workerId: event.workerId,
      round: event.round,
      node: event.node,
      stage: event.stage,
      errorCode: event.errorCode ?? "UNCLASSIFIED",
      shortMessage: event.shortMessage,
      timestamp: event.timestamp,
    });
  }

  return [...errorsByWorker.values()].sort((left, right) => left.workerId.localeCompare(right.workerId));
}

function collectTopFailureReasons(errors: WorkerLatestError[]): RunFailureReason[] {
  const reasons = new Map<string, number>();

  for (const error of errors) {
    reasons.set(error.errorCode, (reasons.get(error.errorCode) ?? 0) + 1);
  }

  return [...reasons.entries()]
    .map(([errorCode, count]) => ({ errorCode, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.errorCode.localeCompare(right.errorCode);
    })
    .slice(0, 3);
}

function buildQualityMetrics(input?: {
  domainCounts: Record<string, number>;
  discardedByReason: Record<string, number>;
}): InvestigationRunQualityMetrics {
  const domainEntries = input ? Object.entries(input.domainCounts) : [];
  const totalByDomain = domainEntries.reduce((acc, [, count]) => acc + safePositiveInt(count), 0);
  const top = domainEntries
    .map(([domain, count]) => ({ domain, count: safePositiveInt(count) }))
    .sort((left, right) => right.count - left.count)[0];

  const discardedEntries = input ? Object.entries(input.discardedByReason) : [];
  const discardedByReason = discardedEntries
    .map(([reason, count]) => ({ reason, count: safePositiveInt(count) }))
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.reason.localeCompare(right.reason);
    });

  const urlsDiscardedByQuality = discardedByReason.reduce((acc, item) => acc + item.count, 0);

  return {
    uniqueDomainsCount: domainEntries.filter(([, count]) => safePositiveInt(count) > 0).length,
    topDomain: top && top.count > 0 ? top.domain : null,
    topDomainShare: totalByDomain > 0 && top ? Number((top.count / totalByDomain).toFixed(4)) : 0,
    urlsDiscardedByQuality,
    discardedByReason,
  };
}

function normalizeGaps(value?: string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return [...unique].slice(0, 12);
}

function safePositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function toRunKey(investigationId: string, runId: string): string {
  return `${investigationId}::${runId}`;
}
