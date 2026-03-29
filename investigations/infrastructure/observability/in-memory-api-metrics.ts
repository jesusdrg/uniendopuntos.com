type MetricKind = "api" | "sse";

export type EndpointMetricSnapshot = {
  key: string;
  kind: MetricKind;
  count: number;
  okCount: number;
  errorCount: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  updatedAt: string | null;
};

export type ApiMetricsSnapshot = {
  generatedAt: string;
  endpoints: EndpointMetricSnapshot[];
};

type MetricBucket = {
  key: string;
  kind: MetricKind;
  count: number;
  okCount: number;
  errorCount: number;
  samplesMs: number[];
  updatedAt: string | null;
};

export class InMemoryApiMetrics {
  private readonly buckets = new Map<string, MetricBucket>();
  private readonly maxSamplesPerEndpoint: number;

  constructor(options?: { maxSamplesPerEndpoint?: number }) {
    this.maxSamplesPerEndpoint = Math.max(1, options?.maxSamplesPerEndpoint ?? 500);
  }

  record(input: { key: string; kind: MetricKind; durationMs: number; success: boolean }): void {
    if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
      return;
    }

    const bucket = this.ensureBucket(input.key, input.kind);
    bucket.count += 1;
    bucket.okCount += input.success ? 1 : 0;
    bucket.errorCount += input.success ? 0 : 1;

    if (bucket.samplesMs.length >= this.maxSamplesPerEndpoint) {
      bucket.samplesMs.shift();
    }

    bucket.samplesMs.push(input.durationMs);
    bucket.updatedAt = new Date().toISOString();
  }

  snapshot(): ApiMetricsSnapshot {
    const endpoints = [...this.buckets.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((bucket) => {
        const sorted = [...bucket.samplesMs].sort((left, right) => left - right);
        return {
          key: bucket.key,
          kind: bucket.kind,
          count: bucket.count,
          okCount: bucket.okCount,
          errorCount: bucket.errorCount,
          p50Ms: this.percentile(sorted, 0.5),
          p95Ms: this.percentile(sorted, 0.95),
          maxMs: sorted[sorted.length - 1] ?? 0,
          updatedAt: bucket.updatedAt,
        } satisfies EndpointMetricSnapshot;
      });

    return {
      generatedAt: new Date().toISOString(),
      endpoints,
    };
  }

  reset(): void {
    this.buckets.clear();
  }

  private ensureBucket(key: string, kind: MetricKind): MetricBucket {
    const existing = this.buckets.get(key);

    if (existing) {
      return existing;
    }

    const created: MetricBucket = {
      key,
      kind,
      count: 0,
      okCount: 0,
      errorCount: 0,
      samplesMs: [],
      updatedAt: null,
    };

    this.buckets.set(key, created);
    return created;
  }

  private percentile(sortedSamples: number[], quantile: number): number {
    if (sortedSamples.length === 0) {
      return 0;
    }

    const index = Math.max(0, Math.ceil(sortedSamples.length * quantile) - 1);
    return sortedSamples[index] ?? 0;
  }
}
