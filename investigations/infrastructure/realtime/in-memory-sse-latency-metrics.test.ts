import { beforeEach, describe, expect, it } from "bun:test";

import { InMemorySseLatencyMetrics } from "@/investigations/infrastructure/realtime/in-memory-sse-latency-metrics";

describe("InMemorySseLatencyMetrics", () => {
  const metrics = new InMemorySseLatencyMetrics();

  beforeEach(() => {
    metrics.reset();
  });

  it("computes p50, p95, p99, max and count", () => {
    metrics.record(10);
    metrics.record(20);
    metrics.record(30);
    metrics.record(40);
    metrics.record(50);

    const snapshot = metrics.snapshot();

    expect(snapshot.count).toBe(5);
    expect(snapshot.sampleCount).toBe(5);
    expect(snapshot.p50).toBe(30);
    expect(snapshot.p95).toBe(50);
    expect(snapshot.p99).toBe(50);
    expect(snapshot.max).toBe(50);
    expect(snapshot.updatedAt).not.toBeNull();
  });

  it("ignores negative and non-finite samples", () => {
    metrics.record(-10);
    metrics.record(Number.NaN);
    metrics.record(Number.POSITIVE_INFINITY);
    metrics.record(100);

    const snapshot = metrics.snapshot();

    expect(snapshot.count).toBe(1);
    expect(snapshot.sampleCount).toBe(1);
    expect(snapshot.p50).toBe(100);
  });

  it("keeps a bounded sliding window of samples", () => {
    const bounded = new InMemorySseLatencyMetrics({ maxSamples: 2 });

    bounded.record(10);
    bounded.record(20);
    bounded.record(30);

    const snapshot = bounded.snapshot();

    expect(snapshot.count).toBe(2);
    expect(snapshot.sampleCount).toBe(2);
    expect(snapshot.p50).toBe(20);
    expect(snapshot.p95).toBe(30);
    expect(snapshot.max).toBe(30);
  });

  it("returns null updatedAt when there are no samples", () => {
    const snapshot = metrics.snapshot();

    expect(snapshot.updatedAt).toBeNull();
    expect(snapshot.sampleCount).toBe(0);
  });
});
