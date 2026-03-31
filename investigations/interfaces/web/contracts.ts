export type InvestigationStatus = "active" | "paused" | "completed";

export type FindingResponse = {
  id: string;
  title: string;
  sourceUrl: string;
  summary: string;
  confidence?: "low" | "medium" | "high";
  evidence?: string[];
  gaps?: string[];
  relatedFindingIds?: string[];
  sharedEntityKeys?: string[];
  claimHashes?: string[];
  createdAt: string;
};

export type InvestigationFindingConnectionResponse = {
  id: string;
  fromId: string;
  toId: string;
  score: number;
  reason: string;
  sharedEntityKeys?: string[];
  sharedClaimHashes?: string[];
};

export type BlockedSourceResponse = {
  id: string;
  url: string;
  reasonCategory: string;
  note?: string;
  blockedAt: string;
};

export type InvestigationResponse = {
  id: string;
  query: string;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  findings: FindingResponse[];
  findingConnections?: InvestigationFindingConnectionResponse[];
  blockedSources: BlockedSourceResponse[];
};

export type StreamConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type InvestigationStreamEvent = {
  type: string;
  timestamp: string;
  payloadSummary: string;
  rawPayload: unknown;
};

export type InvestigationRunStatus = "idle" | "running" | "completed" | "failed";

export type InvestigationRunProgressSummary = {
  round: number | null;
  maxRounds: number | null;
  processedWorkers: number;
  failedWorkers: number;
};

export type RunFailureReason = {
  errorCode: string;
  count: number;
};

export type WorkerLatestError = {
  workerId: string;
  round: number;
  node: string;
  stage: "search" | "reserve" | "scrape" | "extract" | "persist";
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
  quality: {
    uniqueDomainsCount: number;
    topDomain: string | null;
    topDomainShare: number;
    urlsDiscardedByQuality: number;
    discardedByReason: Array<{
      reason: string;
      count: number;
    }>;
  };
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

export type InvestigationTerminationInfo = {
  status: "completed" | "failed";
  reason: "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error";
  roundsExecuted: number;
};

export type InvestigationFinalReport = {
  runId: string;
  executiveSummary: string;
  agentReports: InvestigationWorkerReport[];
  keyFindings: InvestigationKeyFinding[];
  coverage: InvestigationCoverageMetrics;
  termination: InvestigationTerminationInfo;
  topFailureReasons: RunFailureReason[];
  quality: {
    uniqueDomainsCount: number;
    topDomain: string | null;
    topDomainShare: number;
    urlsDiscardedByQuality: number;
    discardedByReason: Array<{
      reason: string;
      count: number;
    }>;
  };
  keyGaps: string[];
};

export type InvestigationRunDiagnosticsResponse = {
  runId: string;
  investigationId: string;
  summary: InvestigationRunSummary | null;
  latestWorkerErrors: WorkerLatestError[];
  events: Array<{
    timestamp: string;
    runId: string;
    investigationId: string;
    round: number;
    node: string;
    workerId: string | null;
    stage: "search" | "reserve" | "scrape" | "extract" | "persist";
    result: "ok" | "error" | "skip";
    errorCode: string | null;
    shortMessage: string;
  }>;
};

export type InvestigationRunState = {
  status: InvestigationRunStatus;
  runId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  progress: InvestigationRunProgressSummary;
  summaryMessage: string;
  runSummary: InvestigationRunSummary | null;
  finalReport: InvestigationFinalReport | null;
};
