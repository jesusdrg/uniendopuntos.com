import type { SsePayloadMode } from "@/investigations/infrastructure/realtime/sse-event-serializer";

export function resolveSsePayloadMode(request: Request): SsePayloadMode {
  const url = new URL(request.url);
  const queryMode = url.searchParams.get("payloadMode")?.trim().toLowerCase();
  const headerMode = request.headers.get("x-sse-payload-mode")?.trim().toLowerCase();

  if (queryMode === "strict-v2" || headerMode === "strict-v2") {
    return "strict-v2";
  }

  return "legacy";
}
