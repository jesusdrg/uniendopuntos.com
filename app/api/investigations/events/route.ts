import {
  apiMetrics,
  investigationEventsBroker,
  sseStreamControl,
} from "@/investigations/interfaces/http/dependencies";
import {
  resolveRequestId,
  withRequestIdHeader,
} from "@/investigations/infrastructure/observability/request-id";
import { logSseEvent } from "@/investigations/infrastructure/observability/structured-logger";
import {
  serializeGlobalHandshakeSnapshot,
  serializeInvestigationSseEvent,
  serializeKeepaliveComment,
} from "@/investigations/infrastructure/realtime/sse-event-serializer";
import { resolveSsePayloadMode } from "@/investigations/infrastructure/realtime/sse-payload-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const requestId = resolveRequestId(request);

  if (!sseStreamControl.tryAcquireGlobalSubscriber()) {
    const rejectedDurationMs = Math.max(0, Math.round(performance.now() - startedAt));

    apiMetrics.record({
      key: "SSE /api/investigations/events",
      kind: "sse",
      durationMs: rejectedDurationMs,
      success: false,
    });

    logSseEvent({
      requestId,
      route: "/api/investigations/events",
      methodOrEvent: "sse.connect",
      statusOrResult: "rejected",
      durationMs: rejectedDurationMs,
      errorCode: "SSE_SUBSCRIBER_LIMIT_REACHED",
    });

    return withRequestIdHeader(
      Response.json(
        {
          error: {
            code: "SSE_SUBSCRIBER_LIMIT_REACHED",
            message: "Se alcanzo el limite de suscriptores SSE globales.",
          },
        },
        { status: 503 },
      ),
      requestId,
    );
  }

  return createSseResponse(request, {
    requestId,
    startedAt,
    payloadMode: resolveSsePayloadMode(request),
  });
}

function createSseResponse(
  request: Request,
  context: {
    requestId: string;
    startedAt: number;
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
        route: "/api/investigations/events",
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
          sseStreamControl.recordGlobalDrop();
          logSseEvent({
            requestId: context.requestId,
            route: "/api/investigations/events",
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
          key: "SSE /api/investigations/events",
          kind: "sse",
          durationMs,
          success: true,
        });
        logSseEvent({
          requestId: context.requestId,
          route: "/api/investigations/events",
          methodOrEvent: "sse.close",
          statusOrResult: "closed",
          durationMs,
        });
        sseStreamControl.releaseGlobalSubscriber();
      };

      safeEnqueue(
        serializeGlobalHandshakeSnapshot({
          connectedAt: new Date().toISOString(),
          keepaliveMs: KEEPALIVE_MS,
        }, { mode: context.payloadMode }),
        "investigation.stream_state",
      );
      safeEnqueue(serializeKeepaliveComment(), "keepalive");

      dispose = investigationEventsBroker.subscribeAll(async (event) => {
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
