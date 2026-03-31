import { afterEach, describe, expect, it } from "bun:test";

import {
  logApiRequest,
  logInvestigationDiagnostic,
  logInvestigationRun,
  logSseEvent,
} from "@/investigations/infrastructure/observability/structured-logger";

describe("structured logger", () => {
  const infoCalls: string[] = [];
  const errorCalls: string[] = [];
  const debugCalls: string[] = [];

  afterEach(() => {
    infoCalls.length = 0;
    errorCalls.length = 0;
    debugCalls.length = 0;
    delete process.env.LOG_LEVEL;
  });

  it("writes API JSON logs with base fields", () => {
    const originalInfo = console.info;
    const originalError = console.error;
    const originalDebug = console.debug;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

    logApiRequest({
      requestId: "req-1",
      route: "/api/investigations",
      methodOrEvent: "POST",
      statusOrResult: "201",
      durationMs: 12,
    });

    console.info = originalInfo;
    console.error = originalError;
    console.debug = originalDebug;

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
    const originalDebug = console.debug;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

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
    console.debug = originalDebug;

    expect(errorCalls).toHaveLength(1);
    const payload = JSON.parse(errorCalls[0] ?? "{}") as {
      level?: string;
      errorCode?: string;
    };

    expect(payload.level).toBe("error");
    expect(payload.errorCode).toBe("SSE_SUBSCRIBER_LIMIT_REACHED");
  });

  it("writes investigation run logs with metadata", () => {
    const originalInfo = console.info;
    const originalError = console.error;
    const originalDebug = console.debug;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

    logInvestigationRun({
      requestId: "run-1",
      route: "investigation-runner",
      methodOrEvent: "run.start",
      statusOrResult: "accepted",
      durationMs: 0,
      metadata: {
        investigationId: "inv-1",
        runId: "run-1",
      },
    });

    console.info = originalInfo;
    console.error = originalError;
    console.debug = originalDebug;

    expect(infoCalls).toHaveLength(1);
    const payload = JSON.parse(infoCalls[0] ?? "{}") as {
      metadata?: { investigationId?: string; runId?: string };
    };

    expect(payload.metadata?.investigationId).toBe("inv-1");
    expect(payload.metadata?.runId).toBe("run-1");
  });

  it("drops debug logs when LOG_LEVEL is info", () => {
    process.env.LOG_LEVEL = "info";

    const originalInfo = console.info;
    const originalError = console.error;
    const originalDebug = console.debug;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

    logApiRequest({
      requestId: "req-2",
      route: "/api/investigations/[id]",
      methodOrEvent: "GET",
      statusOrResult: "200",
      durationMs: 9,
      level: "debug",
    });

    console.info = originalInfo;
    console.error = originalError;
    console.debug = originalDebug;

    expect(infoCalls).toHaveLength(0);
    expect(errorCalls).toHaveLength(0);
    expect(debugCalls).toHaveLength(0);
  });

  it("keeps run logs at info even when LOG_LEVEL=error", () => {
    process.env.LOG_LEVEL = "error";

    const originalInfo = console.info;
    const originalError = console.error;
    const originalDebug = console.debug;
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

    logInvestigationRun({
      requestId: "run-2",
      route: "investigation-runner",
      methodOrEvent: "run.complete",
      statusOrResult: "completed",
      durationMs: 30,
      metadata: {
        investigationId: "inv-2",
        runId: "run-2",
      },
    });

    console.info = originalInfo;
    console.error = originalError;
    console.debug = originalDebug;

    expect(infoCalls).toHaveLength(1);
    expect(errorCalls).toHaveLength(0);
    expect(debugCalls).toHaveLength(0);
  });

  it("writes diagnostic logs with required observability fields", () => {
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;

    const warnCalls: string[] = [];
    console.info = ((value?: unknown) => {
      infoCalls.push(String(value));
    }) as typeof console.info;
    console.warn = ((value?: unknown) => {
      warnCalls.push(String(value));
    }) as typeof console.warn;
    console.error = ((value?: unknown) => {
      errorCalls.push(String(value));
    }) as typeof console.error;
    console.debug = ((value?: unknown) => {
      debugCalls.push(String(value));
    }) as typeof console.debug;

    logInvestigationDiagnostic({
      runId: "run-99",
      investigationId: "inv-99",
      round: 2,
      node: "worker_2",
      workerId: "researcher-2",
      stage: "extract",
      result: "error",
      errorCode: "INTEGRATION_TIMEOUT",
      shortMessage: "Provider timeout",
    });

    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;

    expect(warnCalls).toHaveLength(1);
    const payload = JSON.parse(warnCalls[0] ?? "{}") as {
      runId?: string;
      investigationId?: string;
      round?: number;
      node?: string;
      workerId?: string;
      stage?: string;
      result?: string;
      errorCode?: string;
      shortMessage?: string;
    };

    expect(payload.runId).toBe("run-99");
    expect(payload.investigationId).toBe("inv-99");
    expect(payload.round).toBe(2);
    expect(payload.node).toBe("worker_2");
    expect(payload.workerId).toBe("researcher-2");
    expect(payload.stage).toBe("extract");
    expect(payload.result).toBe("error");
    expect(payload.errorCode).toBe("INTEGRATION_TIMEOUT");
    expect(payload.shortMessage).toBe("Provider timeout");
  });
});
