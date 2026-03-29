import { describe, expect, it } from "bun:test";

import { POST } from "@/app/api/investigations/[id]/findings/route";

describe("POST /api/investigations/[id]/findings", () => {
  it("returns 400 when body is invalid JSON", async () => {
    const request = new Request("http://localhost/api/investigations/inv-1/findings", {
      method: "POST",
      body: "{invalid-json",
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message).toBe("El body debe ser JSON valido.");
  });

  it("preserves x-request-id header in error responses", async () => {
    const request = new Request("http://localhost/api/investigations/inv-1/findings", {
      method: "POST",
      body: "{invalid-json",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-test-123",
      },
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(response.headers.get("x-request-id")).toBe("req-test-123");
  });
});
