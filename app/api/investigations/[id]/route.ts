import {
  deleteInvestigationUseCase,
  getInvestigationByIdUseCase,
} from "@/investigations/interfaces/http/dependencies";
import { toInvestigationResponse } from "@/investigations/interfaces/http/investigation-response";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]",
    metricKey: "GET /api/investigations/[id]",
    handler: async () => {
      const { id } = await context.params;
      const investigation = await getInvestigationByIdUseCase.execute(id);

      return Response.json(toInvestigationResponse(investigation), { status: 200 });
    },
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]",
    metricKey: "DELETE /api/investigations/[id]",
    handler: async () => {
      const { id } = await context.params;
      await deleteInvestigationUseCase.execute(id);

      return new Response(null, { status: 204 });
    },
  });
}
