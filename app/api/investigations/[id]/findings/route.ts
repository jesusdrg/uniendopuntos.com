import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { AddFindingToInvestigationInput } from "@/investigations/application/use-cases/add-finding-to-investigation";
import { addFindingToInvestigationUseCase } from "@/investigations/interfaces/http/dependencies";
import { toInvestigationResponse } from "@/investigations/interfaces/http/investigation-response";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]/findings",
    metricKey: "POST /api/investigations/[id]/findings",
    handler: async () => {
      const { id } = await context.params;
      const body = await parseJsonBody(request);
      const investigation = await addFindingToInvestigationUseCase.execute(id, body);

      return Response.json(toInvestigationResponse(investigation), { status: 200 });
    },
  });
}

async function parseJsonBody(request: Request): Promise<AddFindingToInvestigationInput> {
  try {
    return (await request.json()) as AddFindingToInvestigationInput;
  } catch {
    throw new ValidationError("El body debe ser JSON valido.");
  }
}
