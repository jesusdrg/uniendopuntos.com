import { describe, expect, it } from "bun:test";

import { resolveSsePayloadMode } from "@/investigations/infrastructure/realtime/sse-payload-mode";

describe("resolveSsePayloadMode", () => {
  it("defaults to legacy mode", () => {
    const request = new Request("http://localhost/api/investigations/events");

    expect(resolveSsePayloadMode(request)).toBe("legacy");
  });

  it("uses strict-v2 from query param", () => {
    const request = new Request(
      "http://localhost/api/investigations/events?payloadMode=strict-v2",
    );

    expect(resolveSsePayloadMode(request)).toBe("strict-v2");
  });

  it("uses strict-v2 from header", () => {
    const request = new Request("http://localhost/api/investigations/events", {
      headers: {
        "x-sse-payload-mode": "strict-v2",
      },
    });

    expect(resolveSsePayloadMode(request)).toBe("strict-v2");
  });
});
