export type InvestigationUrlQueueStatus = "pending" | "reserved" | "processed" | "failed";

export type ReservedInvestigationUrl = {
  id: string;
  investigationId: string;
  normalizedUrl: string;
  reservedBy: string;
  reservedAt: string;
};

export type EnqueueUrlsInput = {
  investigationId: string;
  urls: string[];
  discoveredFrom?: string;
};

export type EnqueueUrlsResult = {
  inserted: number;
  deduped: number;
};

export interface InvestigationUrlQueueRepository {
  enqueueMany(input: EnqueueUrlsInput): Promise<EnqueueUrlsResult>;
  reserveNext(input: {
    investigationId: string;
    workerId: string;
    prioritizeDiversity?: boolean;
  }): Promise<ReservedInvestigationUrl | null>;
  markProcessed(queueItemId: string, workerId: string): Promise<void>;
  markFailed(queueItemId: string, workerId: string): Promise<void>;
}
