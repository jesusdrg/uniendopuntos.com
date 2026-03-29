import { describe, expect, it } from "bun:test";

import { InMemorySseStreamControl } from "@/investigations/infrastructure/realtime/in-memory-sse-stream-control";

describe("InMemorySseStreamControl", () => {
  it("rejects global subscriptions above limit and tracks drops", () => {
    const control = new InMemorySseStreamControl(1);

    expect(control.tryAcquireGlobalSubscriber()).toBeTrue();
    expect(control.tryAcquireGlobalSubscriber()).toBeFalse();

    control.recordGlobalDrop();
    control.releaseGlobalSubscriber();

    const snapshot = control.snapshot();
    expect(snapshot.maxGlobalSubscribers).toBe(1);
    expect(snapshot.activeGlobalSubscribers).toBe(0);
    expect(snapshot.rejectedGlobalSubscribers).toBe(1);
    expect(snapshot.droppedGlobalEvents).toBe(1);
  });
});
