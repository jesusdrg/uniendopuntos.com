import { IntegrationError } from "@/investigations/application/errors/integration-error";

export type LlmProviderName = "openrouter" | "groq" | "gemini";

export type LlmProviderConfig = {
  name: LlmProviderName;
  apiKey: string;
  model: string;
};

export type AgentRuntimeConfig = {
  tavilyApiKey: string;
  llmProviders: LlmProviderConfig[];
  langgraphRecursionLimit: number;
};

export const DEFAULT_LANGGRAPH_RECURSION_LIMIT = 100;

const DEFAULT_MODELS: Record<LlmProviderName, string> = {
  openrouter: "openai/gpt-4o-mini",
  groq: "llama-3.1-8b-instant",
  gemini: "gemini-2.0-flash",
};

export function resolveAgentRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AgentRuntimeConfig {
  const tavilyApiKey = env.TAVILY_API_KEY?.trim() ?? "";

  if (tavilyApiKey.length === 0) {
    throw new IntegrationError(
      "config-missing",
      "Falta TAVILY_API_KEY para ejecutar el pipeline real de investigacion.",
    );
  }

  const llmProviders: LlmProviderConfig[] = [];
  pushLlmProviderIfConfigured(llmProviders, "openrouter", env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
  pushLlmProviderIfConfigured(llmProviders, "groq", env.GROQ_API_KEY, env.GROQ_MODEL);
  pushLlmProviderIfConfigured(llmProviders, "gemini", env.GEMINI_API_KEY, env.GEMINI_MODEL);

  if (llmProviders.length === 0) {
    throw new IntegrationError(
      "config-missing",
      "Falta al menos una API key de LLM (OPENROUTER_API_KEY, GROQ_API_KEY o GEMINI_API_KEY).",
    );
  }

  return {
    tavilyApiKey,
    llmProviders,
    langgraphRecursionLimit: resolveLanggraphRecursionLimit(env),
  };
}

function resolveLanggraphRecursionLimit(env: NodeJS.ProcessEnv): number {
  const raw = env.LANGGRAPH_RECURSION_LIMIT?.trim();
  if (!raw) {
    return DEFAULT_LANGGRAPH_RECURSION_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LANGGRAPH_RECURSION_LIMIT;
  }

  return parsed;
}

function pushLlmProviderIfConfigured(
  target: LlmProviderConfig[],
  name: LlmProviderName,
  apiKeyRaw: string | undefined,
  modelRaw: string | undefined,
): void {
  const apiKey = apiKeyRaw?.trim() ?? "";
  if (apiKey.length === 0) {
    return;
  }

  const model = modelRaw?.trim() || DEFAULT_MODELS[name];
  target.push({
    name,
    apiKey,
    model,
  });
}
