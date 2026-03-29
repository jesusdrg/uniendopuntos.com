import type { Investigation } from "@/investigations/domain/entities/investigation";

export type InvestigationResponse = {
  id: string;
  query: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  findings: {
    id: string;
    title: string;
    sourceUrl: string;
    summary: string;
    createdAt: string;
  }[];
  blockedSources: {
    id: string;
    url: string;
    reasonCategory: string;
    note?: string;
    blockedAt: string;
  }[];
};

export function toInvestigationResponse(investigation: Investigation): InvestigationResponse {
  return {
    id: investigation.id,
    query: investigation.query,
    status: investigation.status,
    createdAt: investigation.createdAt,
    updatedAt: investigation.updatedAt,
    findings: investigation.findings,
    blockedSources: investigation.blockedSources,
  };
}
