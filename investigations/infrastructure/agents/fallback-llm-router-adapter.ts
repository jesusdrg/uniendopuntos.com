import { IntegrationError } from "@/investigations/application/errors/integration-error";
import type { FindingDraft, LlmRouterPort } from "@/investigations/domain/ports/llm-router-port";
import type {
  LlmProviderConfig,
  LlmProviderName,
} from "@/investigations/infrastructure/integrations/agent-runtime-config";

type ProviderRequestInput = {
  query: string;
  url: string;
  title: string;
  summary: string;
};

type OpenAiLikeResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class FallbackLlmRouterAdapter implements LlmRouterPort {
  constructor(
    private readonly providers: LlmProviderConfig[],
    private readonly timeoutMs = 18_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateFinding(input: ProviderRequestInput): Promise<FindingDraft> {
    let lastError: IntegrationError | null = null;

    for (const provider of this.providers) {
      try {
        const response = await this.requestProvider(provider, input);
        return parseFinding(response, input);
      } catch (error: unknown) {
        if (error instanceof IntegrationError) {
          lastError = error;

          if (error.category === "auth" || error.category === "rate-limit" || error.category === "timeout") {
            continue;
          }
        }

        throw error;
      }
    }

    throw (
      lastError ??
      new IntegrationError("upstream-failure", "Todos los providers LLM fallaron sin respuesta util.")
    );
  }

  private async requestProvider(
    provider: LlmProviderConfig,
    input: ProviderRequestInput,
  ): Promise<string> {
    const endpoint = resolveEndpoint(provider.name);
    const headers = resolveHeaders(provider.name, provider.apiKey);
  const body = JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            [
              "Sos un analista periodistico forense.",
              "NO inventes datos. Si una afirmacion no esta en el texto provisto, no la escribas.",
              "Responde SOLO JSON valido sin markdown ni texto extra.",
              "Schema estricto:",
              "{",
              '  "title": string,',
              '  "summary": string,',
              '  "confidence": "low"|"medium"|"high",',
              '  "evidence": string[],',
              '  "gaps": string[]',
              "}",
              "Reglas:",
              "- evidence debe incluir al menos 2 citas textuales cortas entre comillas.",
              "- Si falta informacion, explicitalo en gaps.",
              "- Nunca uses conocimiento externo.",
            ].join("\n"),
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
      response_format: {
        type: "json_object",
      },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new IntegrationError("auth", `Provider ${provider.name} rechazo autenticacion.`);
      }

      if (response.status === 429) {
        throw new IntegrationError("rate-limit", `Provider ${provider.name} aplico rate limit.`);
      }

      if (!response.ok) {
        throw new IntegrationError(
          "upstream-failure",
          `Provider ${provider.name} devolvio estado ${response.status}.`,
        );
      }

      const payload = (await response.json()) as OpenAiLikeResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new IntegrationError(
          "upstream-failure",
          `Provider ${provider.name} devolvio respuesta sin contenido.`,
        );
      }

      return content;
    } catch (error: unknown) {
      if (error instanceof IntegrationError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new IntegrationError("timeout", `Provider ${provider.name} excedio timeout.`);
      }

      throw new IntegrationError("upstream-failure", `Fallo de red con provider ${provider.name}.`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveEndpoint(provider: LlmProviderName): string {
  if (provider === "openrouter") {
    return "https://openrouter.ai/api/v1/chat/completions";
  }

  if (provider === "groq") {
    return "https://api.groq.com/openai/v1/chat/completions";
  }

  return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
}

function resolveHeaders(provider: LlmProviderName, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider === "gemini") {
    headers["x-goog-api-key"] = apiKey;
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function buildPrompt(input: ProviderRequestInput): string {
  return [
    `Query de investigacion: ${input.query}`,
    `URL fuente: ${input.url}`,
    `Titulo pagina: ${input.title}`,
    `Resumen pagina: ${input.summary}`,
    "Genera un finding factual y accionable usando solo el contenido provisto.",
  ].join("\n");
}

function parseFinding(content: string, input: ProviderRequestInput): FindingDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return buildSafeFallbackFinding(input, "Respuesta no parseable como JSON.");
  }

  if (!isFindingDraftLike(parsed)) {
    return buildSafeFallbackFinding(input, "Schema de finding invalido en provider.");
  }

  const evidence = ensureMinimumEvidence(parsed.evidence, input);

  return {
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    confidence: parsed.confidence,
    evidence,
    gaps: normalizeStringArray(parsed.gaps),
  };
}

function isFindingDraftLike(value: unknown): value is FindingDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    title?: unknown;
    summary?: unknown;
    confidence?: unknown;
    evidence?: unknown;
    gaps?: unknown;
  };

  const hasValidConfidence =
    candidate.confidence === undefined ||
    candidate.confidence === "low" ||
    candidate.confidence === "medium" ||
    candidate.confidence === "high";

  return (
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0 &&
    typeof candidate.summary === "string" &&
    candidate.summary.trim().length > 0 &&
    hasValidConfidence
  );
}

function buildSafeFallbackFinding(input: ProviderRequestInput, reason: string): FindingDraft {
  return {
    title: truncate(input.title.trim() || "Finding sin titulo", 120),
    summary: truncate(input.summary.trim() || "No se pudo extraer resumen fiable.", 360),
    confidence: "low",
    evidence: ensureMinimumEvidence([], input),
    gaps: [reason, "Salida del LLM degradada: revisar provider/modelo para mejorar precision."],
  };
}

function ensureMinimumEvidence(value: unknown, input: ProviderRequestInput): string[] {
  const normalized = normalizeStringArray(value);
  const quoted = normalized.filter((item) => item.includes('"'));

  if (quoted.length >= 2) {
    return normalized;
  }

  const fallback: string[] = [];
  const title = input.title.trim();
  const summary = input.summary.trim();

  if (title.length > 0) {
    fallback.push(`"${truncate(title, 120)}"`);
  }

  if (summary.length > 0) {
    fallback.push(`"${truncate(summary, 180)}"`);
  }

  if (fallback.length < 2) {
    fallback.push(`"${truncate(input.url, 180)}"`);
  }

  return [...normalized, ...fallback].slice(0, Math.max(2, normalized.length + fallback.length));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim();
    if (normalized.length > 0) {
      output.push(normalized);
    }
  }

  return output;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
}
