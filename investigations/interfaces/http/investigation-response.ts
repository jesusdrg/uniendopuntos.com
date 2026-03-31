import type { Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationResponse } from "@/investigations/interfaces/web/contracts";

export function toInvestigationResponse(investigation: Investigation): InvestigationResponse {
  return {
    id: investigation.id,
    query: investigation.query,
    status: investigation.status,
    createdAt: investigation.createdAt,
    updatedAt: investigation.updatedAt,
    findings: investigation.findings,
    findingConnections: investigation.findingConnections ?? [],
    blockedSources: investigation.blockedSources,
  };
}
