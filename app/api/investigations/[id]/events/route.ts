import { ValidationError } from "@/investigations/application/errors/validation-error";
import { apiMetrics, investigationEventsBroker } from "@/investigations/interfaces/http/dependencies";
import {
  resolveRequestId,
  withRequestIdHeader,
} from "@/investigations/infrastructure/observability/request-id";
import { logSseEvent } from "@/investigations/infrastructure/observability/structured-logger";
import {
  serializeHandshakeSnapshot,
  serializeInvestigationSseEvent,
  serializeKeepaliveComment,
} from "@/investigations/infrastructure/realtime/sse-event-serializer";
import { resolveSsePayloadMode } from "@/investigations/infrastructure/realtime/sse-payload-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = performance.now();
  const requestId = resolveRequestId(request);

  try {
    const { id } = await context.params;
    const investigationId = parseInvestigationId(id);

    return createSseResponse(request, {
      requestId,
      startedAt,
      investigationId,
      payloadMode: resolveSsePayloadMode(request),
    });
  } catch (error: unknown) {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    apiMetrics.record({
      key: "SSE /api/investigations/[id]/events",
      kind: "sse",
      durationMs,
      success: false,
    });
    logSseEvent({
      requestId,
      route: "/api/investigations/[id]/events",
      methodOrEvent: "sse.connect",
      statusOrResult: "error",
      durationMs,
      errorCode: "VALIDATION_ERROR",
    });

    return withRequestIdHeader(
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              error instanceof Error ? error.message : "No se pudo abrir el stream de investigacion.",
          },
        },
        { status: 400 },
      ),
      requestId,
    );
  }
}

function createSseResponse(
  request: Request,
  context: {
    requestId: string;
    startedAt: number;
    investigationId: string;
    payloadMode: "legacy" | "strict-v2";
  },
): Response {
  let closeStream: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let abort: (() => void) | null = null;
      let keepalive: ReturnType<typeof setInterval> | null = null;
      let dispose: (() => void) | null = null;

      logSseEvent({
        requestId: context.requestId,
        route: "/api/investigations/[id]/events",
        methodOrEvent: "sse.connect",
        statusOrResult: "accepted",
        durationMs: 0,
      });

      const safeEnqueue = (chunk: Uint8Array, eventName: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(chunk);
        } catch {
          logSseEvent({
            requestId: context.requestId,
            route: "/api/investigations/[id]/events",
            methodOrEvent: eventName,
            statusOrResult: "dropped",
            durationMs: 0,
            errorCode: "SSE_OVERFLOW",
          });
          closeStream?.();
        }
      };

      closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;

        if (keepalive) {
          clearInterval(keepalive);
        }

        if (dispose) {
          dispose();
        }

        if (abort) {
          request.signal.removeEventListener("abort", abort);
        }

        try {
          controller.close();
        } catch {
          // El stream puede estar cerrado por el runtime.
        }

        const durationMs = Math.max(0, Math.round(performance.now() - context.startedAt));
        apiMetrics.record({
          key: "SSE /api/investigations/[id]/events",
          kind: "sse",
          durationMs,
          success: true,
        });
        logSseEvent({
          requestId: context.requestId,
          route: "/api/investigations/[id]/events",
          methodOrEvent: "sse.close",
          statusOrResult: "closed",
          durationMs,
        });
      };

      safeEnqueue(
        serializeHandshakeSnapshot({
          investigationId: context.investigationId,
          connectedAt: new Date().toISOString(),
          keepaliveMs: KEEPALIVE_MS,
        }, { mode: context.payloadMode }),
        "investigation.stream_state",
      );
      safeEnqueue(serializeKeepaliveComment(), "keepalive");

      dispose = investigationEventsBroker.subscribe(context.investigationId, async (event) => {
        safeEnqueue(
          serializeInvestigationSseEvent(event, { mode: context.payloadMode }),
          event.type,
        );
      });

      keepalive = setInterval(() => {
        safeEnqueue(serializeKeepaliveComment(), "keepalive");
      }, KEEPALIVE_MS);

      abort = () => {
        closeStream?.();
      };

      request.signal.addEventListener("abort", abort, { once: true });
    },
    cancel() {
      closeStream?.();
    },
  });

  return withRequestIdHeader(
    new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }),
    context.requestId,
  );
}

function parseInvestigationId(id: unknown): string {
  if (typeof id !== "string") {
    throw new ValidationError("El parametro 'id' es obligatorio y debe ser string.");
  }

  const normalizedId = id.trim();

  if (normalizedId.length === 0) {
    throw new ValidationError("El parametro 'id' no puede estar vacio.");
  }

  return normalizedId;
}
