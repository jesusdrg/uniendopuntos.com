import { describe, expect, it } from "bun:test";

import { IntegrationError } from "@/investigations/application/errors/integration-error";
import { resolveAgentRuntimeConfig } from "@/investigations/infrastructure/integrations/agent-runtime-config";

describe("resolveAgentRuntimeConfig", () => {
  it("fails strict when Tavily key is missing", () => {
    expect(() =>
      resolveAgentRuntimeConfig({
        NODE_ENV: "test",
        TAVILY_API_KEY: "",
        OPENROUTER_API_KEY: "key",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(IntegrationError);
  });

  it("fails strict when no LLM key is configured", () => {
    expect(() =>
      resolveAgentRuntimeConfig({
        NODE_ENV: "test",
        TAVILY_API_KEY: "tavily-key",
        OPENROUTER_API_KEY: "",
        GROQ_API_KEY: "",
        GEMINI_API_KEY: "",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(IntegrationError);
  });

  it("builds provider list preserving fallback order", () => {
    const config = resolveAgentRuntimeConfig({
      NODE_ENV: "test",
      TAVILY_API_KEY: "tavily-key",
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_MODEL: "openrouter/model",
      GROQ_API_KEY: "groq-key",
      GEMINI_API_KEY: "",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.tavilyApiKey).toBe("tavily-key");
    expect(config.langgraphRecursionLimit).toBe(100);
    expect(config.llmProviders).toEqual([
      {
        name: "openrouter",
        apiKey: "openrouter-key",
        model: "openrouter/model",
      },
      {
        name: "groq",
        apiKey: "groq-key",
        model: "llama-3.1-8b-instant",
      },
    ]);
  });

  it("reads LANGGRAPH_RECURSION_LIMIT when valid", () => {
    const config = resolveAgentRuntimeConfig({
      NODE_ENV: "test",
      TAVILY_API_KEY: "tavily-key",
      OPENROUTER_API_KEY: "openrouter-key",
      LANGGRAPH_RECURSION_LIMIT: "250",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.langgraphRecursionLimit).toBe(250);
  });

  it("falls back recursion limit to default when invalid", () => {
    const config = resolveAgentRuntimeConfig({
      NODE_ENV: "test",
      TAVILY_API_KEY: "tavily-key",
      OPENROUTER_API_KEY: "openrouter-key",
      LANGGRAPH_RECURSION_LIMIT: "-10",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.langgraphRecursionLimit).toBe(100);
  });
});
