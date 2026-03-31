type LogLevel = "debug" | "info" | "warn" | "error";

type LogBase = {
  requestId: string;
  route: string;
  durationMs: number;
  statusOrResult: string;
  methodOrEvent: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
  level?: LogLevel;
  forceInfo?: boolean;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  route: string;
  methodEvent: string;
  statusResult: string;
  durationMs: number;
  errorCode?: string;
  metadata?: Record<string, unknown>;
  runId?: string;
  investigationId?: string;
  round?: number;
  node?: string;
  workerId?: string | null;
  stage?: "search" | "reserve" | "scrape" | "extract" | "persist";
  result?: "ok" | "error" | "skip";
  shortMessage?: string;
};

export type InvestigationDiagnosticLogInput = {
  runId: string;
  investigationId: string;
  round: number;
  node: string;
  workerId: string | null;
  stage: "search" | "reserve" | "scrape" | "extract" | "persist";
  result: "ok" | "error" | "skip";
  errorCode?: string | null;
  shortMessage: string;
  level?: LogLevel;
};

export function logApiRequest(base: LogBase): void {
  writeLog(resolveLevel(base), base);
}

export function logSseEvent(base: LogBase): void {
  writeLog(resolveLevel(base), base);
}

export function logInvestigationRun(base: LogBase): void {
  writeLog("info", {
    ...base,
    forceInfo: true,
  });
}

export function logInvestigationDiagnostic(input: InvestigationDiagnosticLogInput): void {
  const level = input.level ?? resolveDiagnosticLevel(input.result, input.errorCode);

  writeLog(level, {
    requestId: input.runId,
    route: "investigation-runner",
    methodOrEvent: "run.diagnostic",
    statusOrResult: input.result,
    durationMs: 0,
    errorCode: input.errorCode ?? undefined,
    metadata: {
      runId: input.runId,
      investigationId: input.investigationId,
      round: input.round,
      node: input.node,
      workerId: input.workerId,
      stage: input.stage,
      result: input.result,
      shortMessage: input.shortMessage,
    },
    forceInfo: true,
  });
}

function writeLog(level: LogLevel, base: LogBase): void {
  if (!shouldLog(level, base.forceInfo === true)) {
    return;
  }

  const completeEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: base.requestId,
    route: base.route,
    methodEvent: base.methodOrEvent,
    statusResult: base.statusOrResult,
    durationMs: base.durationMs,
    errorCode: base.errorCode,
    metadata: base.metadata,
    runId: toOptionalString(base.metadata?.runId),
    investigationId: toOptionalString(base.metadata?.investigationId),
    round: toOptionalNumber(base.metadata?.round),
    node: toOptionalString(base.metadata?.node),
    workerId: toOptionalStringOrNull(base.metadata?.workerId),
    stage: toOptionalStage(base.metadata?.stage),
    result: toOptionalResult(base.metadata?.result),
    shortMessage: toOptionalString(base.metadata?.shortMessage),
  };

  if (completeEntry.level === "error") {
    console.error(JSON.stringify(completeEntry));
    return;
  }

  if (completeEntry.level === "warn") {
    console.warn(JSON.stringify(completeEntry));
    return;
  }

  if (completeEntry.level === "debug") {
    console.debug(JSON.stringify(completeEntry));
    return;
  }

  console.info(JSON.stringify(completeEntry));
}

function resolveLevel(base: LogBase): LogLevel {
  if (base.level) {
    return base.level;
  }

  return base.errorCode ? "error" : "info";
}

function shouldLog(level: LogLevel, forceInfo: boolean): boolean {
  if (forceInfo && level === "info") {
    return true;
  }

  return levelPriority(level) >= levelPriority(resolveConfiguredLevel());
}

function resolveConfiguredLevel(): LogLevel {
  const rawLevel = process.env.LOG_LEVEL;

  if (rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error") {
    return rawLevel;
  }

  return "info";
}

function levelPriority(level: LogLevel): number {
  switch (level) {
    case "debug":
      return 10;
    case "info":
      return 20;
    case "warn":
      return 30;
    case "error":
      return 40;
    default:
      return 20;
  }
}

function resolveDiagnosticLevel(
  result: "ok" | "error" | "skip",
  errorCode: string | null | undefined,
): LogLevel {
  if (result === "error" || (errorCode ?? "").trim().length > 0) {
    return "warn";
  }

  if (result === "skip") {
    return "info";
  }

  return "info";
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toOptionalStringOrNull(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return toOptionalString(value);
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function toOptionalStage(
  value: unknown,
): "search" | "reserve" | "scrape" | "extract" | "persist" | undefined {
  if (
    value === "search" ||
    value === "reserve" ||
    value === "scrape" ||
    value === "extract" ||
    value === "persist"
  ) {
    return value;
  }

  return undefined;
}

function toOptionalResult(value: unknown): "ok" | "error" | "skip" | undefined {
  if (value === "ok" || value === "error" || value === "skip") {
    return value;
  }

  return undefined;
}
