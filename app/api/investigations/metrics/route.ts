import { apiMetrics, sseStreamControl } from "@/investigations/interfaces/http/dependencies";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      api: apiMetrics.snapshot(),
      sseGlobalControl: sseStreamControl.snapshot(),
    },
    { status: 200 },
  );
}
