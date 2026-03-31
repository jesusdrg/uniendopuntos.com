import { describe, expect, it } from "bun:test";

import { IntegrationError } from "@/investigations/application/errors/integration-error";
import { FallbackLlmRouterAdapter } from "@/investigations/infrastructure/agents/fallback-llm-router-adapter";
import type { LlmProviderConfig } from "@/investigations/infrastructure/integrations/agent-runtime-config";

const providersFallback: LlmProviderConfig[] = [
  { name: "openrouter" as const, apiKey: "a", model: "m1" },
  { name: "groq" as const, apiKey: "b", model: "m2" },
];

const providersGroqOnly: LlmProviderConfig[] = [{ name: "groq" as const, apiKey: "b", model: "m2" }];

describe("FallbackLlmRouterAdapter", () => {
  it("falls back to second provider when first is auth failure", async () => {
    const calls: string[] = [];
    const fetchStub: typeof fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("openrouter.ai")) {
        return new Response("{}", { status: 401 });
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ title: "Titulo", summary: "Resumen" }) } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const adapter = new FallbackLlmRouterAdapter(
      providersFallback,
      10_000,
      fetchStub,
    );

    const finding = await adapter.generateFinding({
      query: "corrupcion",
      url: "https://example.com",
      title: "Fuente",
      summary: "Texto",
    });

    expect(finding.title).toBe("Titulo");
    expect(finding.confidence).toBeUndefined();
    expect(calls.length).toBe(2);
  });

  it("adds safe fallback finding when provider returns invalid JSON", async () => {
    const fetchStub: typeof fetch = ((async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not-json" } }],
        }),
        { status: 200 },
      )) as unknown) as typeof fetch;
    const adapter = new FallbackLlmRouterAdapter(
      providersGroqOnly,
      10_000,
      fetchStub,
    );

    const finding = await adapter.generateFinding({
      query: "test",
      url: "https://example.com",
      title: "Titulo fuente",
      summary: "Resumen fuente",
    });

    expect(finding.confidence).toBe("low");
    expect((finding.evidence?.length ?? 0) >= 2).toBeTrue();
    expect((finding.gaps?.length ?? 0) >= 1).toBeTrue();
  });

  it("normalizes evidence to at least two quoted entries", async () => {
    const fetchStub: typeof fetch = ((async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Titulo",
                  summary: "Resumen",
                  confidence: "high",
                  evidence: ["sin comillas"],
                  gaps: ["falta detalle"],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown) as typeof fetch;
    const adapter = new FallbackLlmRouterAdapter(
      providersGroqOnly,
      10_000,
      fetchStub,
    );

    const finding = await adapter.generateFinding({
      query: "test",
      url: "https://example.com",
      title: "Titulo fuente",
      summary: "Resumen fuente",
    });

    expect(finding.confidence).toBe("high");
    expect((finding.evidence?.length ?? 0) >= 2).toBeTrue();
  });

  it("fails when all providers fail", async () => {
    const fetchStub: typeof fetch = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const adapter = new FallbackLlmRouterAdapter(
      providersFallback,
      10_000,
      fetchStub,
    );

    await expect(
      adapter.generateFinding({
        query: "test",
        url: "https://example.com",
        title: "t",
        summary: "s",
      }),
    ).rejects.toBeInstanceOf(IntegrationError);
  });
});
