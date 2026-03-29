import { AddFindingToInvestigation } from "@/investigations/application/use-cases/add-finding-to-investigation";
import { CreateInvestigation } from "@/investigations/application/use-cases/create-investigation";
import { GetInvestigationById } from "@/investigations/application/use-cases/get-investigation-by-id";
import { ListInvestigations } from "@/investigations/application/use-cases/list-investigations";
import { RegisterBlockedSource } from "@/investigations/application/use-cases/register-blocked-source";
import { JsonFileInvestigationRepository } from "@/investigations/infrastructure/persistence/json-file-investigation-repository";
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

const repository = databaseUrl
  ? new DrizzleSqlInvestigationRepository(createPostgresDatabase(databaseUrl))
  : new JsonFileInvestigationRepository();

export const investigationEventsBroker = new InMemoryInvestigationEventsBroker();
export const sseLatencyMetrics = new InMemorySseLatencyMetrics({
  maxSamples: sseMaxSamples,
});
export const apiMetrics = new InMemoryApiMetrics({
  maxSamplesPerEndpoint: apiMaxSamples,
});
export const sseStreamControl = new InMemorySseStreamControl(maxGlobalSseSubscribers);
const investigationEventsPublisher = new SseInvestigationEventsPublisher(
  investigationEventsBroker,
  sseLatencyMetrics,
);

export const createInvestigationUseCase = new CreateInvestigation(
  repository,
  investigationEventsPublisher,
);
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
