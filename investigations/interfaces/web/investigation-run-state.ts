import type {
  InvestigationFinalReport,
  InvestigationKeyFinding,
  InvestigationRunState,
  InvestigationStreamEvent,
  InvestigationWorkerReport,
} from "@/investigations/interfaces/web/contracts";

type RunPayloadBase = {
  runId?: unknown;
};

type RunStartedPayload = RunPayloadBase & {
  startedAt?: unknown;
};

type RunProgressPayload = RunPayloadBase & {
  round?: unknown;
  maxRounds?: unknown;
  processedWorkers?: unknown;
  failedWorkers?: unknown;
};

type RunSummaryPayload = RunPayloadBase & {
  totalWorkers?: unknown;
  productiveWorkers?: unknown;
  failedWorkers?: unknown;
  findingsCount?: unknown;
  terminationReason?: unknown;
  urlsReservedTotal?: unknown;
  urlsProcessedTotal?: unknown;
  urlsFailedTotal?: unknown;
  findingsCreatedTotal?: unknown;
  findingsPerRound?: unknown;
  topFailureReasons?: unknown;
  quality?: unknown;
};

type WorkerReportedPayload = RunPayloadBase & {
  report?: unknown;
};

type FinalReportReadyPayload = RunPayloadBase & {
  executiveSummary?: unknown;
  agentReports?: unknown;
  keyFindings?: unknown;
  coverage?: unknown;
  termination?: unknown;
  topFailureReasons?: unknown;
  quality?: unknown;
  keyGaps?: unknown;
};

type RunCompletedPayload = RunPayloadBase & {
  completedAt?: unknown;
  summary?: unknown;
};

type RunFailedPayload = RunPayloadBase & {
  failedAt?: unknown;
  message?: unknown;
};

const DEFAULT_PROGRESS = {
  round: null,
  maxRounds: null,
  processedWorkers: 0,
  failedWorkers: 0,
} as const;

export function buildRunState(events: InvestigationStreamEvent[]): InvestigationRunState {
  const ordered = [...events].reverse();
  let state: InvestigationRunState = {
    status: "idle",
    runId: null,
    startedAt: null,
    endedAt: null,
    progress: {
      ...DEFAULT_PROGRESS,
    },
    summaryMessage: "Aun no iniciada",
    runSummary: null,
    finalReport: null,
  };

  for (const event of ordered) {
    if (isRunEvent(event.type, "run_started")) {
      const payload = toRecord(event.rawPayload) as RunStartedPayload;
      state = {
        ...state,
        status: "running",
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        startedAt: toIsoString(payload.startedAt) ?? event.timestamp,
        endedAt: null,
      };
      continue;
    }

    if (isRunEvent(event.type, "run_progress")) {
      const payload = toRecord(event.rawPayload) as RunProgressPayload;
      state = {
        ...state,
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        progress: {
          round: toIntegerOrNull(payload.round),
          maxRounds: toIntegerOrNull(payload.maxRounds),
          processedWorkers: toInteger(payload.processedWorkers),
          failedWorkers: toInteger(payload.failedWorkers),
        },
      };
      continue;
    }

    if (isRunEvent(event.type, "worker_reported")) {
      const payload = toRecord(event.rawPayload) as WorkerReportedPayload;
      const report = toWorkerReport(payload.report);
      if (!report) {
        continue;
      }

      state = {
        ...state,
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        finalReport: mergeWorkerReport(state.finalReport, {
          runId: toNonEmptyString(payload.runId) ?? state.runId ?? "",
          report,
        }),
      };
      continue;
    }

    if (isRunEvent(event.type, "run_completed")) {
      const payload = toRecord(event.rawPayload) as RunCompletedPayload;
      state = {
        ...state,
        status: "completed",
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        endedAt: toIsoString(payload.completedAt) ?? event.timestamp,
        summaryMessage:
          toNonEmptyString(payload.summary) ?? "Corrida completada. Sin resumen adicional.",
      };
      continue;
    }

    if (isRunEvent(event.type, "final_report_ready")) {
      const payload = toRecord(event.rawPayload) as FinalReportReadyPayload;
      const parsed = toFinalReport({
        runId: toNonEmptyString(payload.runId) ?? state.runId ?? "",
        payload,
      });

      state = {
        ...state,
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        finalReport: parsed,
      };
      continue;
    }

    if (isRunEvent(event.type, "run_summary")) {
      const payload = toRecord(event.rawPayload) as RunSummaryPayload;
      state = {
        ...state,
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        runSummary: {
          runId: toNonEmptyString(payload.runId) ?? state.runId ?? "",
          totalWorkers: toInteger(payload.totalWorkers),
          productiveWorkers: toInteger(payload.productiveWorkers),
          failedWorkers: toInteger(payload.failedWorkers),
          findingsCount: toInteger(payload.findingsCount),
          terminationReason: toTerminationReason(payload.terminationReason),
          urlsReservedTotal: toInteger(payload.urlsReservedTotal),
          urlsProcessedTotal: toInteger(payload.urlsProcessedTotal),
          urlsFailedTotal: toInteger(payload.urlsFailedTotal),
          findingsCreatedTotal: toInteger(payload.findingsCreatedTotal),
          findingsPerRound: toIntegerArray(payload.findingsPerRound),
          termination_reason: toTerminationReason(payload.terminationReason),
          urls_reserved_total: toInteger(payload.urlsReservedTotal),
          urls_processed_total: toInteger(payload.urlsProcessedTotal),
          urls_failed_total: toInteger(payload.urlsFailedTotal),
          findings_created_total: toInteger(payload.findingsCreatedTotal),
          findings_per_round: toIntegerArray(payload.findingsPerRound),
          topFailureReasons: toFailureReasons(payload.topFailureReasons),
          quality: toQualityMetrics(payload.quality),
        },
      };
      continue;
    }

    if (isRunEvent(event.type, "run_failed")) {
      const payload = toRecord(event.rawPayload) as RunFailedPayload;
      state = {
        ...state,
        status: "failed",
        runId: toNonEmptyString(payload.runId) ?? state.runId,
        endedAt: toIsoString(payload.failedAt) ?? event.timestamp,
        summaryMessage: toNonEmptyString(payload.message) ?? "La corrida fallo sin mensaje de error.",
      };
    }
  }

  if (events.length === 0) {
    return state;
  }

  if (state.status === "idle") {
    return {
      ...state,
      summaryMessage: "Sin actividad reciente",
    };
  }

  if (state.status === "running") {
    return {
      ...state,
      summaryMessage: "Corrida en ejecucion",
    };
  }

  return state;
}

export function shouldShowFinalReport(runState: InvestigationRunState): boolean {
  return runState.finalReport !== null || runState.status === "completed" || runState.status === "failed";
}

function isRunEvent(
  type: string,
  expected:
    | "run_started"
    | "run_progress"
    | "worker_reported"
    | "run_completed"
    | "run_summary"
    | "final_report_ready"
    | "run_failed",
): boolean {
  return type === expected || type === `investigation.${expected}`;
}

function toFinalReport(input: {
  runId: string;
  payload: FinalReportReadyPayload;
}): InvestigationFinalReport {
  const totalWorkers = toInteger(toRecord(input.payload.coverage).totalWorkers);
  const coverage = toRecord(input.payload.coverage);
  const termination = toRecord(input.payload.termination);

  return {
    runId: input.runId,
    executiveSummary:
      toNonEmptyString(input.payload.executiveSummary) ??
      "Reporte final generado sin resumen ejecutivo.",
    agentReports: toWorkerReports(input.payload.agentReports),
    keyFindings: toKeyFindings(input.payload.keyFindings),
    coverage: {
      totalWorkers,
      workersReported: toInteger(coverage.workersReported),
      productiveWorkers: toInteger(coverage.productiveWorkers),
      failedWorkers: toInteger(coverage.failedWorkers),
      idleWorkers: toInteger(coverage.idleWorkers),
      urlsReservedTotal: toInteger(coverage.urlsReservedTotal),
      urlsProcessedTotal: toInteger(coverage.urlsProcessedTotal),
      urlsFailedTotal: toInteger(coverage.urlsFailedTotal),
      findingsCreatedTotal: toInteger(coverage.findingsCreatedTotal),
      findingsCoverageRatio: toRatio(coverage.findingsCoverageRatio),
    },
    termination: {
      status: termination.status === "failed" ? "failed" : "completed",
      reason: toTerminationReason(termination.reason),
      roundsExecuted: toInteger(termination.roundsExecuted),
    },
    topFailureReasons: toFailureReasons(input.payload.topFailureReasons),
    quality: toQualityMetrics(input.payload.quality),
    keyGaps: toStringArray(input.payload.keyGaps),
  };
}

function toWorkerReport(value: unknown): InvestigationWorkerReport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const workerId = toNonEmptyString(record.workerId);
  if (!workerId) {
    return null;
  }

  const status = toWorkerStatus(record.status);

  return {
    workerId,
    round: toInteger(record.round),
    node: toNonEmptyString(record.node) ?? "unknown",
    status,
    findingCreated: Boolean(record.findingCreated),
    processedUrl: toNonEmptyString(record.processedUrl),
    errorCode: toNonEmptyString(record.errorCode),
    note: toNonEmptyString(record.note) ?? "sin detalle",
  };
}

function toWorkerReports(value: unknown): InvestigationWorkerReport[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: InvestigationWorkerReport[] = [];
  for (const item of value) {
    const report = toWorkerReport(item);
    if (report) {
      output.push(report);
    }
  }
  return output;
}

function toKeyFindings(value: unknown): InvestigationKeyFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: InvestigationKeyFinding[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = toNonEmptyString(record.id);
    const title = toNonEmptyString(record.title);
    const sourceUrl = toNonEmptyString(record.sourceUrl);
    const summary = toNonEmptyString(record.summary);
    if (!id || !title || !sourceUrl || !summary) {
      continue;
    }

    output.push({
      id,
      title,
      sourceUrl,
      summary,
      confidence: toConfidence(record.confidence),
    });
  }

  return output;
}

function toWorkerStatus(value: unknown): "processed" | "idle" | "error" {
  return value === "processed" || value === "idle" || value === "error" ? value : "idle";
}

function toConfidence(value: unknown): "low" | "medium" | "high" | "unknown" {
  if (value === "low" || value === "medium" || value === "high" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function toRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function mergeWorkerReport(
  current: InvestigationFinalReport | null,
  input: {
    runId: string;
    report: InvestigationWorkerReport;
  },
): InvestigationFinalReport {
  const base: InvestigationFinalReport =
    current ?? {
      runId: input.runId,
      executiveSummary: "Reporte parcial por workers en progreso.",
      agentReports: [],
      keyFindings: [],
      coverage: {
        totalWorkers: 0,
        workersReported: 0,
        productiveWorkers: 0,
        failedWorkers: 0,
        idleWorkers: 0,
        urlsReservedTotal: 0,
        urlsProcessedTotal: 0,
        urlsFailedTotal: 0,
        findingsCreatedTotal: 0,
        findingsCoverageRatio: 0,
      },
      termination: {
        status: "completed",
        reason: "error",
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
    };

  const nextReports = [...base.agentReports];
  const existingIndex = nextReports.findIndex((item) => item.workerId === input.report.workerId);
  if (existingIndex >= 0) {
    nextReports[existingIndex] = input.report;
  } else {
    nextReports.push(input.report);
  }

  return {
    ...base,
    runId: input.runId || base.runId,
    agentReports: nextReports.sort((left, right) => left.workerId.localeCompare(right.workerId)),
    coverage: {
      ...base.coverage,
      workersReported: nextReports.length,
      productiveWorkers: nextReports.filter((item) => item.status === "processed").length,
      failedWorkers: nextReports.filter((item) => item.status === "error").length,
      idleWorkers: nextReports.filter((item) => item.status === "idle").length,
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function toIsoString(value: unknown): string | null {
  const normalized = toNonEmptyString(value);

  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function toInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function toIntegerOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function toFailureReasons(value: unknown): Array<{ errorCode: string; count: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: Array<{ errorCode: string; count: number }> = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const candidate = item as {
      errorCode?: unknown;
      count?: unknown;
    };

    const errorCode = toNonEmptyString(candidate.errorCode);
    if (!errorCode) {
      continue;
    }

    output.push({
      errorCode,
      count: toInteger(candidate.count),
    });
  }

  return output;
}

function toQualityMetrics(value: unknown): {
  uniqueDomainsCount: number;
  topDomain: string | null;
  topDomainShare: number;
  urlsDiscardedByQuality: number;
  discardedByReason: Array<{ reason: string; count: number }>;
} {
  const record = toRecord(value);
  const discardedRaw = record.discardedByReason;
  const discardedByReason: Array<{ reason: string; count: number }> = [];

  if (Array.isArray(discardedRaw)) {
    for (const item of discardedRaw) {
      const candidate = toRecord(item);
      const reason = toNonEmptyString(candidate.reason);
      if (!reason) {
        continue;
      }

      discardedByReason.push({
        reason,
        count: toInteger(candidate.count),
      });
    }
  }

  return {
    uniqueDomainsCount: toInteger(record.uniqueDomainsCount),
    topDomain: toNonEmptyString(record.topDomain),
    topDomainShare: toRatio(record.topDomainShare),
    urlsDiscardedByQuality: toInteger(record.urlsDiscardedByQuality),
    discardedByReason,
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: string[] = [];
  for (const item of value) {
    const normalized = toNonEmptyString(item);
    if (normalized) {
      output.push(normalized);
    }
  }

  return output;
}

function toTerminationReason(
  value: unknown,
): "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error" {
  if (
    value === "queue_exhausted" ||
    value === "no_progress" ||
    value === "max_rounds" ||
    value === "recursion_limit" ||
    value === "error"
  ) {
    return value;
  }

  return "error";
}

function toIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: number[] = [];
  for (const item of value) {
    output.push(toInteger(item));
  }

  return output;
}
