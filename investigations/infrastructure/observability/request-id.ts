const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(request: Request): string {
  const incomingRequestId = request.headers.get(REQUEST_ID_HEADER)?.trim();

  if (incomingRequestId) {
    return incomingRequestId;
  }

  return crypto.randomUUID();
}

export function withRequestIdHeader(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
