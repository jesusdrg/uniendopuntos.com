import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { RegisterBlockedSourceInput } from "@/investigations/application/use-cases/register-blocked-source";
import { registerBlockedSourceUseCase } from "@/investigations/interfaces/http/dependencies";
import { toInvestigationResponse } from "@/investigations/interfaces/http/investigation-response";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations/[id]/blocked-sources",
    metricKey: "POST /api/investigations/[id]/blocked-sources",
    handler: async () => {
      const { id } = await context.params;
      const body = await parseJsonBody(request);
      const investigation = await registerBlockedSourceUseCase.execute(id, body);

      return Response.json(toInvestigationResponse(investigation), { status: 200 });
    },
  });
}

async function parseJsonBody(request: Request): Promise<RegisterBlockedSourceInput> {
  try {
    return (await request.json()) as RegisterBlockedSourceInput;
  } catch {
    throw new ValidationError("El body debe ser JSON valido.");
  }
}
