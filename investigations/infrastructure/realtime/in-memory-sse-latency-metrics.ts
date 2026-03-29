export type InvestigationSseLatencySnapshot = {
  count: number;
  sampleCount: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  updatedAt: string | null;
};

export class InMemorySseLatencyMetrics {
  private readonly samplesMs: number[] = [];
  private readonly maxSamples: number;
  private lastUpdatedAt: string | null = null;

  constructor(options?: { maxSamples?: number }) {
    this.maxSamples = Math.max(1, options?.maxSamples ?? 1_000);
  }

  record(latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      return;
    }

    if (this.samplesMs.length >= this.maxSamples) {
      this.samplesMs.shift();
    }

    this.samplesMs.push(latencyMs);
    this.lastUpdatedAt = new Date().toISOString();
  }

  snapshot(): InvestigationSseLatencySnapshot {
    if (this.samplesMs.length === 0) {
      return {
        count: 0,
        sampleCount: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
        updatedAt: this.lastUpdatedAt,
      };
    }

    const sorted = [...this.samplesMs].sort((left, right) => left - right);

    return {
      count: sorted.length,
      sampleCount: sorted.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      max: sorted[sorted.length - 1] ?? 0,
      updatedAt: this.lastUpdatedAt,
    };
  }

  reset(): void {
    this.samplesMs.length = 0;
    this.lastUpdatedAt = null;
  }

  private percentile(sortedSamples: number[], quantile: number): number {
    const index = Math.max(0, Math.ceil(sortedSamples.length * quantile) - 1);
    return sortedSamples[index] ?? 0;
  }
}
