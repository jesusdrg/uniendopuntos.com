import { describe, expect, it } from "bun:test";

import {
  resolveRequestId,
  withRequestIdHeader,
} from "@/investigations/infrastructure/observability/request-id";

describe("request id", () => {
  it("keeps incoming x-request-id", () => {
    const request = new Request("http://localhost/api/investigations", {
      headers: {
        "x-request-id": "req-preserved-1",
      },
    });

    expect(resolveRequestId(request)).toBe("req-preserved-1");
  });

  it("generates x-request-id when missing", () => {
    const request = new Request("http://localhost/api/investigations");
    const requestId = resolveRequestId(request);

    expect(requestId).toBeString();
    expect(requestId.length).toBeGreaterThan(10);
  });

  it("sets x-request-id response header", async () => {
    const baseResponse = Response.json({ ok: true }, { status: 200 });
    const observed = withRequestIdHeader(baseResponse, "req-resp-1");
    const payload = (await observed.json()) as { ok: boolean };

    expect(observed.headers.get("x-request-id")).toBe("req-resp-1");
    expect(payload.ok).toBeTrue();
  });
});
