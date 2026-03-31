import { IntegrationError } from "@/investigations/application/errors/integration-error";
import type { WebSearchPort } from "@/investigations/domain/ports/web-search-port";
import { normalizeUrl } from "@/investigations/infrastructure/persistence/url-normalizer";

type TavilySearchResponse = {
  results?: Array<{
    url?: string;
  }>;
};

export class TavilyWebSearchAdapter implements WebSearchPort {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = 12_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string, options?: { limit?: number }): Promise<string[]> {
    const limit = Math.max(1, Math.min(options?.limit ?? 5, 10));
    const response = await this.requestSearch(query, limit);
    const json = (await response.json()) as TavilySearchResponse;

    const unique = new Set<string>();
    for (const item of json.results ?? []) {
      const candidate = item.url?.trim();
      if (!candidate) {
        continue;
      }

      try {
        unique.add(normalizeUrl(candidate));
      } catch {
        continue;
      }
    }

    return [...unique].slice(0, limit);
  }

  private async requestSearch(query: string, limit: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: limit,
        }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new IntegrationError("auth", "Tavily rechazo la autenticacion del API key.");
      }

      if (response.status === 429) {
        throw new IntegrationError("rate-limit", "Tavily aplico rate limit en la busqueda web.");
      }

      if (!response.ok) {
        throw new IntegrationError(
          "upstream-failure",
          `Tavily devolvio estado ${response.status} en search.`,
        );
      }

      return response;
    } catch (error: unknown) {
      if (error instanceof IntegrationError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new IntegrationError("timeout", "Tavily no respondio dentro del timeout configurado.");
      }

      throw new IntegrationError("upstream-failure", "Fallo de red al consultar Tavily.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
