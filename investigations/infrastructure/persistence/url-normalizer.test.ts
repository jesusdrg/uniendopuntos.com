import { describe, expect, it } from "bun:test";

import { normalizeUrl } from "@/investigations/infrastructure/persistence/url-normalizer";

describe("normalizeUrl", () => {
  it("normalizes host, hash and query param order", () => {
    const normalized = normalizeUrl("https://EXAMPLE.com/path/?b=2&a=1#section");

    expect(normalized).toBe("https://example.com/path?a=1&b=2");
  });
});
