import { describe, expect, it } from "bun:test";

import {
  decideRoundContinuation,
  InvestigationAgentGraphRunner,
} from "@/investigations/application/services/investigation-agent-graph";
import { InMemoryInvestigationRunDiagnosticsStore } from "@/investigations/application/services/investigation-run-diagnostics";
import { DEFAULT_LANGGRAPH_RECURSION_LIMIT } from "@/investigations/infrastructure/integrations/agent-runtime-config";
import { AddFindingToInvestigation } from "@/investigations/application/use-cases/add-finding-to-investigation";
import { GetInvestigationById } from "@/investigations/application/use-cases/get-investigation-by-id";
import type { Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationDomainEvent } from "@/investigations/domain/events/investigation-domain-event";
import type { InvestigationDomainEventPayload } from "@/investigations/domain/ports/investigation-events-publisher";
import type { InvestigationEventsPublisher } from "@/investigations/domain/ports/investigation-events-publisher";
import type {
  FindingDraft,
  LlmRouterPort,
} from "@/investigations/domain/ports/llm-router-port";
import { GraphRecursionError } from "@langchain/langgraph";
import type {
  EnqueueUrlsInput,
  EnqueueUrlsResult,
  InvestigationUrlQueueRepository,
  ReservedInvestigationUrl,
} from "@/investigations/domain/ports/investigation-url-queue-repository";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";
import type { ScrapedDocument, WebScraperPort } from "@/investigations/domain/ports/web-scraper-port";
import type { WebSearchPort } from "@/investigations/domain/ports/web-search-port";

class InMemoryRepository implements InvestigationRepository {
  private readonly items = new Map<string, Investigation>();

  async save(investigation: Investigation): Promise<void> {
    this.items.set(investigation.id, investigation);
  }

  async findById(id: string): Promise<Investigation | null> {
    return this.items.get(id) ?? null;
  }

  async list(): Promise<Investigation[]> {
    return [...this.items.values()];
  }

  async deleteById(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

class InMemoryQueueRepository implements InvestigationUrlQueueRepository {
  private readonly items: Array<{
    id: string;
    investigationId: string;
    normalizedUrl: string;
    status: "pending" | "reserved" | "processed" | "failed";
    reservedBy?: string;
  }> = [];

  private nextId = 0;

  async enqueueMany(input: EnqueueUrlsInput): Promise<EnqueueUrlsResult> {
    let inserted = 0;

    for (const url of input.urls) {
      const exists = this.items.some(
        (item) => item.investigationId === input.investigationId && item.normalizedUrl === url,
      );

      if (exists) {
        continue;
      }

      this.nextId += 1;
      this.items.push({
        id: String(this.nextId),
        investigationId: input.investigationId,
        normalizedUrl: url,
        status: "pending",
      });
      inserted += 1;
    }

    return {
      inserted,
      deduped: input.urls.length - inserted,
    };
  }

  async reserveNext(input: {
    investigationId: string;
    workerId: string;
    prioritizeDiversity?: boolean;
  }): Promise<ReservedInvestigationUrl | null> {
    const { investigationId, workerId } = input;
    const candidate = this.items.find(
      (item) => item.investigationId === investigationId && item.status === "pending",
    );

    if (!candidate) {
      return null;
    }

    candidate.status = "reserved";
    candidate.reservedBy = workerId;

    return {
      id: candidate.id,
      investigationId: candidate.investigationId,
      normalizedUrl: candidate.normalizedUrl,
      reservedBy: workerId,
      reservedAt: new Date().toISOString(),
    };
  }

  async markProcessed(queueItemId: string, workerId: string): Promise<void> {
    void workerId;
    const item = this.items.find((entry) => entry.id === queueItemId);
    if (item) {
      item.status = "processed";
    }
  }

  async markFailed(queueItemId: string, workerId: string): Promise<void> {
    void workerId;
    const item = this.items.find((entry) => entry.id === queueItemId);
    if (item) {
      item.status = "failed";
    }
  }
}

class DeterministicSearchAdapter implements WebSearchPort {
  async search(query: string, options?: { limit?: number }): Promise<string[]> {
    const limit = options?.limit ?? 5;
    const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "-"));
    return Array.from({ length: limit }, (_, index) => `https://example.com/${slug}/${index + 1}`);
  }
}

class DeterministicScraperAdapter implements WebScraperPort {
  async scrape(url: string): Promise<ScrapedDocument> {
    const host = new URL(url).hostname;
    return {
      title: `Fuente ${host}`,
      summary:
        `Resumen de ${url}. Documento con contexto, evidencia y fuentes cruzadas para validar hipotesis. ` +
        "Incluye hechos verificables, actores involucrados y referencias publicas citables.",
      outgoingUrls: [`${url}/a`, `${url}/b`],
    };
  }
}

class DeterministicLlmAdapter implements LlmRouterPort {
  async generateFinding(input: {
    query: string;
    url: string;
    title: string;
    summary: string;
  }): Promise<FindingDraft> {
    return {
      title: `${input.title} | finding`,
      summary: `${input.summary} (${input.query})`,
      confidence: "medium",
      evidence: ["\"evidencia 1\"", "\"evidencia 2\""],
      gaps: ["Sin dato financiero"],
    };
  }
}

class CapturingEventsPublisher implements InvestigationEventsPublisher {
  public readonly events: InvestigationDomainEvent[] = [];

  async publish(event: InvestigationDomainEvent): Promise<void> {
    this.events.push(event);
  }
}

class FailingSearchAdapter implements WebSearchPort {
  async search(): Promise<string[]> {
    throw new Error("Tavily unavailable in test");
  }
}

class AlwaysRecursingSearchAdapter implements WebSearchPort {
  async search(query: string, options?: { limit?: number }): Promise<string[]> {
    const limit = options?.limit ?? 5;
    return Array.from({ length: limit }, (_, index) => `https://loop.example/${encodeURIComponent(query)}/${index}`);
  }
}

class AlwaysRecursingScraperAdapter implements WebScraperPort {
  async scrape(url: string): Promise<ScrapedDocument> {
    return {
      title: `Loop ${url}`,
      summary: `Contenido ${url}`,
      outgoingUrls: [`${url}/next-a`, `${url}/next-b`],
    };
  }
}

describe("InvestigationAgentGraphRunner", () => {
  it("runs 3 parallel researchers and produces findings", async () => {
    const repository = new InMemoryRepository();
    const queue = new InMemoryQueueRepository();
    const now = new Date().toISOString();

    await repository.save({
      id: "inv-graph",
      query: "tema test",
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [],
      blockedSources: [],
    });

    const getById = new GetInvestigationById(repository);
    const addFinding = new AddFindingToInvestigation(repository);

    const eventsPublisher = new CapturingEventsPublisher();
    const diagnostics = new InMemoryInvestigationRunDiagnosticsStore();
    const runner = new InvestigationAgentGraphRunner({
      investigationRepository: repository,
      getInvestigationById: getById,
      addFinding,
      eventsPublisher,
      urlQueue: queue,
      search: new DeterministicSearchAdapter(),
      scraper: new DeterministicScraperAdapter(),
      llm: new DeterministicLlmAdapter(),
      diagnostics,
      langgraphRecursionLimit: DEFAULT_LANGGRAPH_RECURSION_LIMIT,
    });

    const result = await runner.runInvestigation("inv-graph");

    const updated = await repository.findById("inv-graph");

    expect(result.runId).toBeString();
    expect(result.summary).toContain("Investigacion finalizada");
    expect(updated?.status).toBe("completed");
    expect((updated?.findings.length ?? 0) > 0).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.run_started")).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.run_progress")).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.worker_reported")).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.run_summary")).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.final_report_ready")).toBeTrue();
    expect(eventsPublisher.events.some((event) => event.type === "investigation.run_completed")).toBeTrue();
    const summaryEvent = eventsPublisher.events.find((event) => event.type === "investigation.run_summary");
    if (!summaryEvent || summaryEvent.type !== "investigation.run_summary") {
      throw new Error("summary event missing");
    }
    const payload = summaryEvent.payload as InvestigationDomainEventPayload<"investigation.run_summary">;
    expect(payload.terminationReason).toBeDefined();
    expect(typeof payload.urlsReservedTotal).toBe("number");

    const finalReportEvent = eventsPublisher.events.find((event) => event.type === "investigation.final_report_ready");
    if (!finalReportEvent || finalReportEvent.type !== "investigation.final_report_ready") {
      throw new Error("final report event missing");
    }

    const finalPayload = finalReportEvent.payload as InvestigationDomainEventPayload<"investigation.final_report_ready">;
    expect(finalPayload.executiveSummary.length > 0).toBeTrue();
    expect(finalPayload.agentReports.length > 0).toBeTrue();
    expect(finalPayload.coverage.totalWorkers).toBe(3);
  });

  it("marks investigation as paused and emits run_failed when graph crashes", async () => {
    const repository = new InMemoryRepository();
    const queue = new InMemoryQueueRepository();
    const now = new Date().toISOString();

    await repository.save({
      id: "inv-graph-fail",
      query: "tema test",
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [],
      blockedSources: [],
    });

    const getById = new GetInvestigationById(repository);
    const addFinding = new AddFindingToInvestigation(repository);
    const eventsPublisher = new CapturingEventsPublisher();
    const diagnostics = new InMemoryInvestigationRunDiagnosticsStore();
    const runner = new InvestigationAgentGraphRunner({
      investigationRepository: repository,
      getInvestigationById: getById,
      addFinding,
      eventsPublisher,
      urlQueue: queue,
      search: new FailingSearchAdapter(),
      scraper: new DeterministicScraperAdapter(),
      llm: new DeterministicLlmAdapter(),
      diagnostics,
      langgraphRecursionLimit: DEFAULT_LANGGRAPH_RECURSION_LIMIT,
    });

    await expect(runner.runInvestigation("inv-graph-fail")).rejects.toThrow(
      "Tavily unavailable in test",
    );

    const updated = await repository.findById("inv-graph-fail");
    expect(updated?.status).toBe("paused");
    expect(eventsPublisher.events.some((event) => event.type === "investigation.run_failed")).toBeTrue();
  });

  it("maps GraphRecursionError to LANGGRAPH_RECURSION_LIMIT", async () => {
    const repository = new InMemoryRepository();
    const queue = new InMemoryQueueRepository();
    const now = new Date().toISOString();

    await repository.save({
      id: "inv-graph-rec",
      query: "tema test",
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [],
      blockedSources: [],
    });

    const getById = new GetInvestigationById(repository);
    const addFinding = new AddFindingToInvestigation(repository);
    const eventsPublisher = new CapturingEventsPublisher();
    const diagnostics = new InMemoryInvestigationRunDiagnosticsStore();
    const runner = new InvestigationAgentGraphRunner({
      investigationRepository: repository,
      getInvestigationById: getById,
      addFinding,
      eventsPublisher,
      urlQueue: queue,
      search: new DeterministicSearchAdapter(),
      scraper: new DeterministicScraperAdapter(),
      llm: new DeterministicLlmAdapter(),
      diagnostics,
      langgraphRecursionLimit: 1,
    });

    await expect(runner.runInvestigation("inv-graph-rec")).rejects.toBeInstanceOf(GraphRecursionError);
    const failed = eventsPublisher.events.find((event) => event.type === "investigation.run_failed");
    if (!failed || failed.type !== "investigation.run_failed") {
      throw new Error("failed event missing");
    }
    const payload = failed.payload as InvestigationDomainEventPayload<"investigation.run_failed">;
    expect(payload.errorCode).toBe("LANGGRAPH_RECURSION_LIMIT");
  });

  it("fails with recursion limit when graph keeps making progress", async () => {
    const repository = new InMemoryRepository();
    const queue = new InMemoryQueueRepository();
    const now = new Date().toISOString();

    await repository.save({
      id: "inv-graph-rec-2",
      query: "tema loop",
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [],
      blockedSources: [],
    });

    const getById = new GetInvestigationById(repository);
    const addFinding = new AddFindingToInvestigation(repository);
    const eventsPublisher = new CapturingEventsPublisher();
    const diagnostics = new InMemoryInvestigationRunDiagnosticsStore();
    const runner = new InvestigationAgentGraphRunner({
      investigationRepository: repository,
      getInvestigationById: getById,
      addFinding,
      eventsPublisher,
      urlQueue: queue,
      search: new AlwaysRecursingSearchAdapter(),
      scraper: new AlwaysRecursingScraperAdapter(),
      llm: new DeterministicLlmAdapter(),
      diagnostics,
      langgraphRecursionLimit: 1,
    });

    await expect(runner.runInvestigation("inv-graph-rec-2")).rejects.toBeInstanceOf(GraphRecursionError);
    const failed = eventsPublisher.events.find((event) => event.type === "investigation.run_failed");
    if (!failed || failed.type !== "investigation.run_failed") {
      throw new Error("failed event missing");
    }
    const payload = failed.payload as InvestigationDomainEventPayload<"investigation.run_failed">;
    expect(payload.errorCode).toBe("LANGGRAPH_RECURSION_LIMIT");
  });
});

describe("decideRoundContinuation", () => {
  it("continues when there was useful work even without findings", () => {
    const decision = decideRoundContinuation({
      round: 1,
      maxRounds: 4,
      workerOutcomes: [
        { workerId: "w1", findingCreated: false, note: "error", processedUrl: "https://example.com/a" },
        { workerId: "w2", findingCreated: false, note: "idle" },
      ],
    });

    expect(decision.next).toBe("continue");
    expect(decision.terminationReason).toBeNull();
  });

  it("stops with queue_exhausted when all workers are idle", () => {
    const decision = decideRoundContinuation({
      round: 1,
      maxRounds: 4,
      workerOutcomes: [
        { workerId: "w1", findingCreated: false, note: "idle" },
        { workerId: "w2", findingCreated: false, note: "idle" },
      ],
    });

    expect(decision.next).toBe("synthesize");
    expect(decision.terminationReason).toBe("queue_exhausted");
  });
});
