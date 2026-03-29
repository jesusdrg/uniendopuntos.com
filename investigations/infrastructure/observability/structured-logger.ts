type LogLevel = "info" | "error";

type LogBase = {
  requestId: string;
  route: string;
  durationMs: number;
  statusOrResult: string;
  methodOrEvent: string;
  errorCode?: string;
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
};

export function logApiRequest(base: LogBase): void {
  writeLog(base.errorCode ? "error" : "info", base);
}

export function logSseEvent(base: LogBase): void {
  writeLog(base.errorCode ? "error" : "info", base);
}

function writeLog(level: LogLevel, base: LogBase): void {
  const completeEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: base.requestId,
    route: base.route,
    methodEvent: base.methodOrEvent,
    statusResult: base.statusOrResult,
    durationMs: base.durationMs,
    errorCode: base.errorCode,
  };

  if (completeEntry.level === "error") {
    console.error(JSON.stringify(completeEntry));
    return;
  }

  console.info(JSON.stringify(completeEntry));
}
