import { ValidationError } from "@/investigations/application/errors/validation-error";
import { investigationRunDiagnostics } from "@/investigations/interfaces/http/dependencies";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; runId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]/runs/[runId]/diagnostics",
    metricKey: "GET /api/investigations/[id]/runs/[runId]/diagnostics",
    handler: async () => {
      const { id, runId } = await context.params;
      const investigationId = parseParam(id, "id");
      const normalizedRunId = parseParam(runId, "runId");

      const diagnostics = investigationRunDiagnostics.getRunDiagnostics({
        investigationId,
        runId: normalizedRunId,
      });

      if (!diagnostics) {
        return Response.json(
          {
            error: {
              code: "RUN_DIAGNOSTICS_NOT_FOUND",
              message: "No hay diagnosticos para el run solicitado.",
            },
          },
          { status: 404 },
        );
      }

      return Response.json(diagnostics, { status: 200 });
    },
  });
}

function parseParam(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`El parametro '${name}' es obligatorio y debe ser string.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ValidationError(`El parametro '${name}' no puede estar vacio.`);
  }

  return normalized;
}
