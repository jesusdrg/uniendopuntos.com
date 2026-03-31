import { AddFindingToInvestigation } from "@/investigations/application/use-cases/add-finding-to-investigation";
import { InMemoryInvestigationRunJobs } from "@/investigations/application/services/in-memory-investigation-run-jobs";
import {
  InvestigationAgentGraphRunner,
} from "@/investigations/application/services/investigation-agent-graph";
import { InMemoryInvestigationRunDiagnosticsStore } from "@/investigations/application/services/investigation-run-diagnostics";
import { StartInvestigationRunner } from "@/investigations/application/services/start-investigation-runner";
import { CreateInvestigation } from "@/investigations/application/use-cases/create-investigation";
import { DeleteInvestigation } from "@/investigations/application/use-cases/delete-investigation";
import { GetInvestigationById } from "@/investigations/application/use-cases/get-investigation-by-id";
import { ListInvestigations } from "@/investigations/application/use-cases/list-investigations";
import { RegisterBlockedSource } from "@/investigations/application/use-cases/register-blocked-source";
import { IntegrationError } from "@/investigations/application/errors/integration-error";
import { DrizzleSqlInvestigationUrlQueueRepository } from "@/investigations/infrastructure/persistence/postgres/drizzle-sql-investigation-url-queue-repository";
import { JsonFileInvestigationRepository } from "@/investigations/infrastructure/persistence/json-file-investigation-repository";
import { FallbackLlmRouterAdapter } from "@/investigations/infrastructure/agents/fallback-llm-router-adapter";
import { PlaywrightWebScraperAdapter } from "@/investigations/infrastructure/agents/playwright-web-scraper-adapter";
import { TavilyWebSearchAdapter } from "@/investigations/infrastructure/agents/tavily-web-search-adapter";
import { launchChromiumBrowser } from "@/investigations/infrastructure/agents/playwright-browser-launcher";
import { resolveAgentRuntimeConfig } from "@/investigations/infrastructure/integrations/agent-runtime-config";
import { DrizzleSqlInvestigationRepository } from "@/investigations/infrastructure/persistence/postgres/drizzle-sql-investigation-repository";
import { InMemoryApiMetrics } from "@/investigations/infrastructure/observability/in-memory-api-metrics";
import { createPostgresDatabase } from "@/investigations/infrastructure/persistence/postgres/postgres-client";
import { InMemoryInvestigationEventsBroker } from "@/investigations/infrastructure/realtime/in-memory-investigation-events-broker";
import { InMemorySseLatencyMetrics } from "@/investigations/infrastructure/realtime/in-memory-sse-latency-metrics";
import { InMemorySseStreamControl } from "@/investigations/infrastructure/realtime/in-memory-sse-stream-control";
import { SseInvestigationEventsPublisher } from "@/investigations/infrastructure/realtime/sse-investigation-events-publisher";

const databaseUrl = process.env.DATABASE_URL?.trim();
const sseMaxSamplesRaw = Number.parseInt(process.env.SSE_LATENCY_MAX_SAMPLES ?? "", 10);
const sseMaxSamples = Number.isFinite(sseMaxSamplesRaw) ? sseMaxSamplesRaw : undefined;
const apiMaxSamplesRaw = Number.parseInt(process.env.API_METRICS_MAX_SAMPLES ?? "", 10);
const apiMaxSamples = Number.isFinite(apiMaxSamplesRaw) ? apiMaxSamplesRaw : undefined;
const maxGlobalSseSubscribersRaw = Number.parseInt(
  process.env.SSE_GLOBAL_MAX_SUBSCRIBERS ?? "",
  10,
);
const maxGlobalSseSubscribers = Number.isFinite(maxGlobalSseSubscribersRaw)
  ? Math.max(1, maxGlobalSseSubscribersRaw)
  : 50;

const database = databaseUrl ? createPostgresDatabase(databaseUrl) : null;
const repository = database
  ? new DrizzleSqlInvestigationRepository(database)
  : new JsonFileInvestigationRepository();
const urlQueueRepository = database ? new DrizzleSqlInvestigationUrlQueueRepository(database) : null;

let realRuntimeConfigError: IntegrationError | null = null;
const realRuntime = createRealRuntime();

export const investigationEventsBroker = new InMemoryInvestigationEventsBroker();
export const sseLatencyMetrics = new InMemorySseLatencyMetrics({
  maxSamples: sseMaxSamples,
});
export const apiMetrics = new InMemoryApiMetrics({
  maxSamplesPerEndpoint: apiMaxSamples,
});
export const sseStreamControl = new InMemorySseStreamControl(maxGlobalSseSubscribers);
export const investigationRunDiagnostics = new InMemoryInvestigationRunDiagnosticsStore();
const investigationEventsPublisher = new SseInvestigationEventsPublisher(
  investigationEventsBroker,
  sseLatencyMetrics,
);

export const createInvestigationUseCase = new CreateInvestigation(
  repository,
  investigationEventsPublisher,
);
export const deleteInvestigationUseCase = new DeleteInvestigation(repository);
export const getInvestigationByIdUseCase = new GetInvestigationById(repository);
export const listInvestigationsUseCase = new ListInvestigations(repository);
export const addFindingToInvestigationUseCase = new AddFindingToInvestigation(
  repository,
  investigationEventsPublisher,
);
export const registerBlockedSourceUseCase = new RegisterBlockedSource(
  repository,
  investigationEventsPublisher,
);

const getInvestigationByIdForGraph = new GetInvestigationById(repository);
const addFindingForGraph = new AddFindingToInvestigation(repository, investigationEventsPublisher);

export const investigationGraphRunner =
  urlQueueRepository === null || realRuntime === null
    ? null
      : new InvestigationAgentGraphRunner({
          investigationRepository: repository,
          getInvestigationById: getInvestigationByIdForGraph,
          addFinding: addFindingForGraph,
          eventsPublisher: investigationEventsPublisher,
          urlQueue: urlQueueRepository,
          search: realRuntime.search,
          scraper: realRuntime.scraper,
          llm: realRuntime.llm,
          diagnostics: investigationRunDiagnostics,
          langgraphRecursionLimit: realRuntime.langgraphRecursionLimit,
        });

export const startInvestigationRunner =
  investigationGraphRunner === null
    ? null
    : new StartInvestigationRunner(investigationGraphRunner);

export const investigationRunJobs =
  startInvestigationRunner === null ? null : new InMemoryInvestigationRunJobs(startInvestigationRunner);

export const investigationProviderMode = "real" as const;
export const investigationRuntimeConfigError = realRuntimeConfigError;

function createRealRuntime(): {
  search: TavilyWebSearchAdapter;
  scraper: PlaywrightWebScraperAdapter;
  llm: FallbackLlmRouterAdapter;
  langgraphRecursionLimit: number;
} | null {
  try {
    const config = resolveAgentRuntimeConfig();
    return {
      search: new TavilyWebSearchAdapter(config.tavilyApiKey),
      scraper: new PlaywrightWebScraperAdapter(() => launchChromiumBrowser()),
      llm: new FallbackLlmRouterAdapter(config.llmProviders),
      langgraphRecursionLimit: config.langgraphRecursionLimit,
    };
  } catch (error: unknown) {
    if (error instanceof IntegrationError) {
      realRuntimeConfigError = error;
      return null;
    }

    throw error;
  }
}
