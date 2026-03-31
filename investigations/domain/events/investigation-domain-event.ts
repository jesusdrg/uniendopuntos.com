import type { BlockedSource, FindingCard, Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationFindingConnection } from "@/investigations/domain/entities/investigation";

export type InvestigationEventType =
  | "investigation.created"
  | "investigation.finding_added"
  | "investigation.finding_connections_updated"
  | "investigation.blocked_source_registered"
  | "investigation.run_started"
  | "investigation.run_progress"
  | "investigation.worker_reported"
  | "investigation.run_summary"
  | "investigation.final_report_ready"
  | "investigation.run_completed"
  | "investigation.run_failed";

export type InvestigationTerminationReason =
  | "queue_exhausted"
  | "no_progress"
  | "max_rounds"
  | "recursion_limit"
  | "error";

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

export type InvestigationCoverageMetrics = {
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

export type InvestigationRunQualityMetrics = {
  uniqueDomainsCount: number;
  topDomain: string | null;
  topDomainShare: number;
  urlsDiscardedByQuality: number;
  discardedByReason: Array<{
    reason: string;
    count: number;
  }>;
};

export type InvestigationTerminationInfo = {
  status: "completed" | "failed";
  reason: InvestigationTerminationReason;
  roundsExecuted: number;
};

export type InvestigationEventPayloadMap = {
  "investigation.created": {
    investigation: Investigation;
  };
  "investigation.finding_added": {
    finding: FindingCard;
    updatedAt: string;
  };
  "investigation.finding_connections_updated": {
    connections: InvestigationFindingConnection[];
    updatedAt: string;
  };
  "investigation.blocked_source_registered": {
    blockedSource: BlockedSource;
    updatedAt: string;
  };
  "investigation.run_started": {
    runId: string;
    status: "active";
    startedAt: string;
  };
  "investigation.run_progress": {
    runId: string;
    round: number;
    maxRounds: number;
    processedWorkers: number;
    failedWorkers: number;
    idleWorkers: number;
  };
  "investigation.worker_reported": {
    runId: string;
    report: InvestigationWorkerReport;
  };
  "investigation.run_summary": {
    runId: string;
    totalWorkers: number;
    productiveWorkers: number;
    failedWorkers: number;
    findingsCount: number;
    terminationReason: InvestigationTerminationReason;
    urlsReservedTotal: number;
    urlsProcessedTotal: number;
    urlsFailedTotal: number;
    findingsCreatedTotal: number;
    findingsPerRound: number[];
    termination_reason: InvestigationTerminationReason;
    urls_reserved_total: number;
    urls_processed_total: number;
    urls_failed_total: number;
    findings_created_total: number;
    findings_per_round: number[];
    topFailureReasons: Array<{
      errorCode: string;
      count: number;
    }>;
    quality: InvestigationRunQualityMetrics;
  };
  "investigation.final_report_ready": {
    runId: string;
    executiveSummary: string;
    agentReports: InvestigationWorkerReport[];
    keyFindings: InvestigationKeyFinding[];
    coverage: InvestigationCoverageMetrics;
    termination: InvestigationTerminationInfo;
    topFailureReasons: Array<{
      errorCode: string;
      count: number;
    }>;
    quality: InvestigationRunQualityMetrics;
    keyGaps: string[];
  };
  "investigation.run_completed": {
    runId: string;
    status: "completed";
    summary: string;
    findingsCount: number;
    completedAt: string;
  };
  "investigation.run_failed": {
    runId: string;
    status: "paused";
    errorCode: string;
    message: string;
    failedAt: string;
  };
};

export type InvestigationDomainEvent<TType extends InvestigationEventType = InvestigationEventType> = {
  type: TType;
  investigationId: string;
  occurredAt: string;
  persistedAt: string;
  payload: InvestigationEventPayloadMap[TType];
};
