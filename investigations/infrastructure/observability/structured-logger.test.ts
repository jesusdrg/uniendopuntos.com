import { afterEach, describe, expect, it } from "bun:test";

import {
  logApiRequest,
  logSseEvent,
} from "@/investigations/infrastructure/observability/structured-logger";

describe("structured logger", () => {
  const infoCalls: string[] = [];
  const errorCalls: string[] = [];

  afterEach(() => {
    infoCalls.length = 0;
    errorCalls.length = 0;
  });

  it("writes API JSON logs with base fields", () => {
    const originalInfo = console.info;
    const originalError = console.error;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;

    logApiRequest({
      requestId: "req-1",
      route: "/api/investigations",
      methodOrEvent: "POST",
      statusOrResult: "201",
      durationMs: 12,
    });

    console.info = originalInfo;
    console.error = originalError;

    expect(infoCalls).toHaveLength(1);
    const payload = JSON.parse(infoCalls[0] ?? "{}") as {
      timestamp?: string;
      level?: string;
      requestId?: string;
      route?: string;
      methodEvent?: string;
      statusResult?: string;
      durationMs?: number;
      errorCode?: string;
    };

    expect(payload.timestamp).toBeString();
    expect(payload.level).toBe("info");
    expect(payload.requestId).toBe("req-1");
    expect(payload.route).toBe("/api/investigations");
    expect(payload.methodEvent).toBe("POST");
    expect(payload.statusResult).toBe("201");
    expect(payload.durationMs).toBe(12);
    expect(payload.errorCode).toBeUndefined();
  });

  it("writes SSE error logs with errorCode", () => {
    const originalInfo = console.info;
    const originalError = console.error;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;

    logSseEvent({
      requestId: "req-sse-1",
      route: "/api/investigations/events",
      methodOrEvent: "sse.connect",
      statusOrResult: "rejected",
      durationMs: 1,
      errorCode: "SSE_SUBSCRIBER_LIMIT_REACHED",
    });

    console.info = originalInfo;
    console.error = originalError;

    expect(errorCalls).toHaveLength(1);
    const payload = JSON.parse(errorCalls[0] ?? "{}") as {
      level?: string;
      errorCode?: string;
    };

    expect(payload.level).toBe("error");
    expect(payload.errorCode).toBe("SSE_SUBSCRIBER_LIMIT_REACHED");
  });
});
