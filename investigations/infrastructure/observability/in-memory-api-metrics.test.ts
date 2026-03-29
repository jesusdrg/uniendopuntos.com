import { describe, expect, it } from "bun:test";

import { InMemoryApiMetrics } from "@/investigations/infrastructure/observability/in-memory-api-metrics";

describe("InMemoryApiMetrics", () => {
  it("tracks counts and latency percentiles per endpoint", () => {
    const metrics = new InMemoryApiMetrics({ maxSamplesPerEndpoint: 10 });

    metrics.record({
      key: "POST /api/investigations",
      kind: "api",
      durationMs: 10,
      success: true,
    });
    metrics.record({
      key: "POST /api/investigations",
      kind: "api",
      durationMs: 100,
      success: false,
    });

    const snapshot = metrics.snapshot();
    const endpoint = snapshot.endpoints.find((entry) => entry.key === "POST /api/investigations");

    expect(endpoint).toBeDefined();
    expect(endpoint?.count).toBe(2);
    expect(endpoint?.okCount).toBe(1);
    expect(endpoint?.errorCount).toBe(1);
    expect(endpoint?.p50Ms).toBe(10);
    expect(endpoint?.p95Ms).toBe(100);
    expect(endpoint?.maxMs).toBe(100);
  });
});
