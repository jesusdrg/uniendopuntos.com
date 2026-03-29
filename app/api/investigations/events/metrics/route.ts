import {
  apiMetrics,
  sseLatencyMetrics,
  sseStreamControl,
} from "@/investigations/interfaces/http/dependencies";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      metric: "investigation_sse_publish_latency_ms",
      description:
        "Latencia desde persistencia exitosa del cambio hasta emision SSE (y entrega a cada subscriber conectado).",
      unit: "ms",
      sloTarget: "p95 < 2000",
      streams: apiMetrics.snapshot().endpoints.filter((endpoint) => endpoint.kind === "sse"),
      globalControl: sseStreamControl.snapshot(),
      ...sseLatencyMetrics.snapshot(),
    },
    { status: 200 },
  );
}
