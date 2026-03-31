import { describe, expect, it } from "bun:test";

import { IntegrationError } from "@/investigations/application/errors/integration-error";
import { PlaywrightWebScraperAdapter } from "@/investigations/infrastructure/agents/playwright-web-scraper-adapter";

describe("PlaywrightWebScraperAdapter", () => {
  it("extracts title, summary and outgoing urls", async () => {
    const adapter = new PlaywrightWebScraperAdapter(async () => ({
      async newPage() {
        return {
          async goto() {
            return;
          },
          async title() {
            return "Pagina de prueba";
          },
          async evaluate<T>(fn: () => T): Promise<T> {
            void fn;
            return {
              summary: "Contenido relevante",
              links: ["/nota-1", "https://externo.com/nota-2"],
            } as T;
          },
          async close() {
            return;
          },
        };
      },
      async close() {
        return;
      },
    }));

    const result = await adapter.scrape("https://medio.com/base");

    expect(result.title).toBe("Pagina de prueba");
    expect(result.summary).toBe("Contenido relevante");
    expect(result.outgoingUrls).toEqual([
      "https://medio.com/nota-1",
      "https://externo.com/nota-2",
    ]);
  });

  it("maps timeout errors to integration timeout category", async () => {
    const adapter = new PlaywrightWebScraperAdapter(async () => ({
      async newPage() {
        return {
          async goto() {
            const error = new Error("Navigation timeout after 30000ms");
            error.name = "TimeoutError";
            throw error;
          },
          async title() {
            return "";
          },
          async evaluate<T>(fn: () => T): Promise<T> {
            return fn();
          },
          async close() {
            return;
          },
        };
      },
      async close() {
        return;
      },
    }));

    try {
      await adapter.scrape("https://medio.com/base");
      throw new Error("Expected scraper to throw timeout integration error");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(IntegrationError);
      if (error instanceof IntegrationError) {
        expect(error.category).toBe("timeout");
      }
    }
  });
});
