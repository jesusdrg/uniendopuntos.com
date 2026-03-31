import { describe, expect, it } from "bun:test";

describe("playwright-browser-launcher", () => {
  it("exports launchChromiumBrowser function", async () => {
    const launcherModule = await import("@/investigations/infrastructure/agents/playwright-browser-launcher");
    expect(typeof launcherModule.launchChromiumBrowser).toBe("function");
  });
});
