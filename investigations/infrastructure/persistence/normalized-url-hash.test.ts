import { describe, expect, it } from "bun:test";

import { normalizedUrlHash } from "@/investigations/infrastructure/persistence/normalized-url-hash";

describe("normalizedUrlHash", () => {
  it("returns stable sha256 hex hash", () => {
    const value = "https://example.com/a?a=1&b=2";
    const hash = normalizedUrlHash(value);

    expect(hash).toBe(normalizedUrlHash(value));
    expect(hash).toBeString();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
