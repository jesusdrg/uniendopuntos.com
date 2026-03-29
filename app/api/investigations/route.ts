import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { CreateInvestigationInput } from "@/investigations/application/use-cases/create-investigation";
import {
  createInvestigationUseCase,
  listInvestigationsUseCase,
} from "@/investigations/interfaces/http/dependencies";
import { toInvestigationResponse } from "@/investigations/interfaces/http/investigation-response";
import { withObservedHttp } from "@/investigations/infrastructure/observability/observed-http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations",
    metricKey: "POST /api/investigations",
    handler: async () => {
      const body = await parseJsonBody(request);
      const investigation = await createInvestigationUseCase.execute(body);

      return Response.json(toInvestigationResponse(investigation), { status: 201 });
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return withObservedHttp(request, {
    route: "/api/investigations",
    metricKey: "GET /api/investigations",
    handler: async () => {
      const investigations = await listInvestigationsUseCase.execute();

      return Response.json(investigations.map(toInvestigationResponse), { status: 200 });
    },
  });
}

async function parseJsonBody(request: Request): Promise<CreateInvestigationInput> {
  try {
    return (await request.json()) as CreateInvestigationInput;
  } catch {
    throw new ValidationError("El body debe ser JSON valido.");
  }
}
