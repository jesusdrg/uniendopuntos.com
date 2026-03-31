import type { InvestigationResponse } from "@/investigations/interfaces/web/contracts";
import type { InvestigationRunDiagnosticsResponse } from "@/investigations/interfaces/web/contracts";

type CreateInvestigationInput = {
  query: string;
};

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

export async function listInvestigations(): Promise<InvestigationResponse[]> {
  const response = await fetch("/api/investigations", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  return parseJsonResponse<InvestigationResponse[]>(response);
}

export async function createInvestigation(
  input: CreateInvestigationInput,
): Promise<InvestigationResponse> {
  const response = await fetch("/api/investigations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<InvestigationResponse>(response);
}

export async function getInvestigationById(id: string): Promise<InvestigationResponse> {
  const response = await fetch(`/api/investigations/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  return parseJsonResponse<InvestigationResponse>(response);
}

export async function deleteInvestigation(id: string): Promise<void> {
  const response = await fetch(`/api/investigations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 204) {
    return;
  }

  await parseJsonResponse<never>(response);
}

export async function startInvestigation(id: string): Promise<{
  investigationId: string;
  status: "started" | "already_running";
  mode: "real";
  runId?: string;
  startedAt?: string;
  reason?: "already_running";
}> {
  const response = await fetch(`/api/investigations/${encodeURIComponent(id)}/start`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<{
    investigationId: string;
    status: "started" | "already_running";
    mode: "real";
    runId?: string;
    startedAt?: string;
    reason?: "already_running";
  }>(response);
}

export async function getRunDiagnostics(
  investigationId: string,
  runId: string,
): Promise<InvestigationRunDiagnosticsResponse> {
  const response = await fetch(
    `/api/investigations/${encodeURIComponent(investigationId)}/runs/${encodeURIComponent(runId)}/diagnostics`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  return parseJsonResponse<InvestigationRunDiagnosticsResponse>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let message = `Request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as ErrorResponse;
    if (body.error?.message) {
      message = body.error.message;
    }
  } catch {
    // Keep default message when body is not JSON.
  }

  throw new Error(message);
}
