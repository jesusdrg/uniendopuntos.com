import { ValidationError } from "@/investigations/application/errors/validation-error";
import {
  getInvestigationByIdUseCase,
  investigationRuntimeConfigError,
  investigationProviderMode,
  investigationRunJobs,
} from "@/investigations/interfaces/http/dependencies";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";
import { logInvestigationRun } from "@/investigations/infrastructure/observability/structured-logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]/start",
    metricKey: "POST /api/investigations/[id]/start",
    handler: async (requestId) => {
      const { id } = await context.params;
      const investigationId = parseInvestigationId(id);

      await getInvestigationByIdUseCase.execute(investigationId);

      if (!investigationRunJobs) {
        if (investigationRuntimeConfigError) {
          throw investigationRuntimeConfigError;
        }

        return Response.json(
          {
            error: {
              code: "INVESTIGATION_RUNNER_UNAVAILABLE",
              message:
                "El runner de investigacion requiere DATABASE_URL configurada para la cola atomica.",
            },
          },
          { status: 503 },
        );
      }

      const started = investigationRunJobs.start(investigationId);

      logInvestigationRun({
        requestId,
        route: "/api/investigations/[id]/start",
        methodOrEvent: "run.start",
        statusOrResult: started.accepted ? "accepted" : "already_running",
        durationMs: 0,
        metadata: {
          investigationId,
          runId: started.runId,
          startedAt: started.startedAt,
          mode: investigationProviderMode,
          reason: started.reason,
        },
      });

      if (!started.accepted) {
        return Response.json(
          {
            investigationId,
            runId: started.runId,
            startedAt: started.startedAt,
            reason: started.reason,
            status: "already_running",
            mode: investigationProviderMode,
          },
          { status: 202 },
        );
      }

      return Response.json(
        {
          investigationId,
          runId: started.runId,
          startedAt: started.startedAt,
          status: "started",
          mode: investigationProviderMode,
        },
        { status: 202 },
      );
    },
  });
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
