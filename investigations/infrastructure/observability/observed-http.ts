import { ApplicationError } from "@/investigations/application/errors/application-error";
import { toErrorResponse } from "@/investigations/interfaces/http/error-response";
import { apiMetrics } from "@/investigations/interfaces/http/dependencies";
import { resolveRequestId, withRequestIdHeader } from "@/investigations/infrastructure/observability/request-id";
import { logApiRequest } from "@/investigations/infrastructure/observability/structured-logger";

type ExecuteResult = {
  response: Response;
  errorCode?: string;
};

export async function withObservedHttp(
  request: Request,
  input: {
    route: string;
    metricKey: string;
    handler: (requestId: string) => Promise<ExecuteResult | Response>;
  },
): Promise<Response> {
  const startedAt = performance.now();
  const requestId = resolveRequestId(request);

  let response: Response;
  let errorCode: string | undefined;

  try {
    const result = await input.handler(requestId);

    if (result instanceof Response) {
      response = result;
    } else {
      response = result.response;
      errorCode = result.errorCode;
    }
  } catch (error: unknown) {
    response = toErrorResponse(error);
    errorCode = error instanceof ApplicationError ? error.code : "INTERNAL_ERROR";
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const observedResponse = withRequestIdHeader(response, requestId);

  apiMetrics.record({
    key: input.metricKey,
    kind: "api",
    durationMs,
    success: observedResponse.status < 400,
  });

  logApiRequest({
    requestId,
    route: input.route,
    methodOrEvent: request.method,
    statusOrResult: String(observedResponse.status),
    durationMs,
    errorCode,
  });

  return observedResponse;
}
