import { randomUUID } from "node:crypto";

import { Annotation, GraphRecursionError, StateGraph } from "@langchain/langgraph";

import type { AddFindingToInvestigation } from "@/investigations/application/use-cases/add-finding-to-investigation";
import {
  buildFinalInvestigationReport,
  buildRunSummary,
  type InvestigationDiagnosticEvent,
  type InvestigationDiagnosticStage,
  type InvestigationKeyFinding,
  type InvestigationWorkerReport,
  type InvestigationRunDiagnosticsStore,
} from "@/investigations/application/services/investigation-run-diagnostics";
import {
  capSeedUrlsByDomain,
  evaluateFindingQuality,
  evaluateScrapedContentQuality,
  expandSearchQueries,
} from "@/investigations/application/services/research-quality";
import { deriveInvestigationFindingConnections } from "@/investigations/application/services/finding-connections";
import { IntegrationError } from "@/investigations/application/errors/integration-error";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { GetInvestigationById } from "@/investigations/application/use-cases/get-investigation-by-id";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";
import type { InvestigationUrlQueueRepository } from "@/investigations/domain/ports/investigation-url-queue-repository";
import {
  createInvestigationDomainEvent,
  type InvestigationEventsPublisher,
} from "@/investigations/domain/ports/investigation-events-publisher";
import type { FindingDraft, LlmRouterPort } from "@/investigations/domain/ports/llm-router-port";
import type { ScrapedDocument, WebScraperPort } from "@/investigations/domain/ports/web-scraper-port";
import type { WebSearchPort } from "@/investigations/domain/ports/web-search-port";
import {
  logInvestigationDiagnostic,
  logInvestigationRun,
} from "@/investigations/infrastructure/observability/structured-logger";

const MAX_ROUNDS = 4;
const WORKER_IDS = ["researcher-1", "researcher-2", "researcher-3"] as const;
const MAX_SEEDS_TOTAL = 12;
const MAX_SEEDS_PER_DOMAIN = 2;

type WorkerId = "researcher-1" | "researcher-2" | "researcher-3";

type WorkerOutcome = {
  workerId: string;
  round?: number;
  node?: string;
  processedUrl?: string;
  findingCreated: boolean;
  note: "processed" | "idle" | "error";
  errorCode?: string | null;
  reportNote?: string;
};

const InvestigationGraphState = Annotation.Root({
  investigationId: Annotation<string>,
  query: Annotation<string>,
  round: Annotation<number>,
  maxRounds: Annotation<number>,
  routeDecision: Annotation<"continue" | "synthesize">,
  terminationReason: Annotation<
    "queue_exhausted" | "no_progress" | "max_rounds" | "recursion_limit" | "error" | null
  >,
  finalSummary: Annotation<string>,
  workerOutcomes: Annotation<Record<string, WorkerOutcome>>({
    default: () => ({}),
    reducer: (left, right) => ({ ...left, ...right }),
  }),
  domainCounts: Annotation<Record<string, number>>({
    default: () => ({}),
    reducer: (left, right) => mergeCounterMap(left, right),
  }),
  discardedByReason: Annotation<Record<string, number>>({
    default: () => ({}),
    reducer: (left, right) => mergeCounterMap(left, right),
  }),
});

type GraphState = typeof InvestigationGraphState.State;

export type InvestigationGraphRuntime = {
  investigationRepository: InvestigationRepository;
  getInvestigationById: GetInvestigationById;
  addFinding: AddFindingToInvestigation;
  eventsPublisher: InvestigationEventsPublisher;
  urlQueue: InvestigationUrlQueueRepository;
  search: WebSearchPort;
  scraper: WebScraperPort;
  llm: LlmRouterPort;
  diagnostics: InvestigationRunDiagnosticsStore;
  langgraphRecursionLimit: number;
};

type GraphExecutionContext = {
  runId: string;
  investigationId: string;
};

export function buildInvestigationAgentGraph(
  runtime: InvestigationGraphRuntime,
  execution: GraphExecutionContext,
) {
  const emitDiagnostic = (input: {
    round: number;
    node: string;
    workerId: WorkerId | null;
    stage: InvestigationDiagnosticStage;
    result: "ok" | "error" | "skip";
    errorCode?: string | null;
    shortMessage: string;
  }): InvestigationDiagnosticEvent => {
    const event = runtime.diagnostics.record({
      runId: execution.runId,
      investigationId: execution.investigationId,
      round: input.round,
      node: input.node,
      workerId: input.workerId,
      stage: input.stage,
      result: input.result,
      errorCode: input.errorCode ?? null,
      shortMessage: shortenMessage(input.shortMessage),
    });

    logInvestigationDiagnostic({
      runId: event.runId,
      investigationId: event.investigationId,
      round: event.round,
      node: event.node,
      workerId: event.workerId,
      stage: event.stage,
      result: event.result,
      errorCode: event.errorCode,
      shortMessage: event.shortMessage,
    });

    return event;
  };

  const emitWorkerReport = async (input: {
    workerId: string;
    round: number;
    node: string;
    status: "processed" | "idle" | "error";
    findingCreated: boolean;
    processedUrl?: string;
    errorCode?: string | null;
    note: string;
  }): Promise<void> => {
    await runtime.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.worker_reported",
        investigationId: execution.investigationId,
        persistedAt: new Date().toISOString(),
        payload: {
          runId: execution.runId,
          report: {
            workerId: input.workerId,
            round: input.round,
            node: input.node,
            status: input.status,
            findingCreated: input.findingCreated,
            processedUrl: input.processedUrl ?? null,
            errorCode: input.errorCode ?? null,
            note: input.note,
          },
        },
      }),
    );
  };

  const orchestrator = async (state: GraphState) => {
    const maxRounds = state.maxRounds || MAX_ROUNDS;
    const nextRound = state.round + 1;

    if (state.round === 0) {
      try {
        const expandedQueries = expandSearchQueries(state.query);
        const rawSeedUrls: string[] = [];

        for (const subQuery of expandedQueries) {
          const urls = await runtime.search.search(subQuery, { limit: 4 });
          rawSeedUrls.push(...urls);
        }

        const seedUrls = capSeedUrlsByDomain({
          urls: dedupeUrls(rawSeedUrls),
          maxPerDomain: MAX_SEEDS_PER_DOMAIN,
          maxTotal: MAX_SEEDS_TOTAL,
        });
        const enqueueResult = await runtime.urlQueue.enqueueMany({
          investigationId: state.investigationId,
          urls: seedUrls,
        });

        emitDiagnostic({
          round: nextRound,
          node: "orchestrator",
          workerId: null,
          stage: "search",
          result: "ok",
          shortMessage: `Subqueries=${expandedQueries.length}; seeds=${seedUrls.length}; inserted=${enqueueResult.inserted}, deduped=${enqueueResult.deduped}`,
        });
      } catch (error: unknown) {
        emitDiagnostic({
          round: nextRound,
          node: "orchestrator",
          workerId: null,
          stage: "search",
          result: "error",
          errorCode: resolveErrorCode(error, "SEARCH_STAGE_FAILED"),
          shortMessage: resolveErrorShortMessage(error, "Fallo en busqueda inicial de URLs."),
        });
        throw error;
      }
    } else {
      emitDiagnostic({
        round: nextRound,
        node: "orchestrator",
        workerId: null,
        stage: "search",
        result: "skip",
        shortMessage: "Round sin seed search; se reutiliza cola existente.",
      });
    }

    return {
      maxRounds,
      round: nextRound,
      routeDecision: "continue",
      terminationReason: null,
      workerOutcomes: {},
      domainCounts: {},
      discardedByReason: {},
    };
  };

  const runWorker = (workerId: WorkerId, node: string) => async (state: GraphState) => {
    const reserved = await runtime.urlQueue.reserveNext({
      investigationId: state.investigationId,
      workerId,
      prioritizeDiversity: true,
    });

    if (!reserved) {
      emitDiagnostic({
        round: state.round,
        node,
        workerId,
        stage: "reserve",
        result: "skip",
        shortMessage: "No hay URLs pendientes para reservar.",
      });

      await emitWorkerReport({
        workerId,
        round: state.round,
        node,
        status: "idle",
        findingCreated: false,
        note: "No habia URLs pendientes.",
      });

      return {
        workerOutcomes: {
          [workerId]: {
            workerId,
            round: state.round,
            node,
            findingCreated: false,
            note: "idle",
            errorCode: null,
            reportNote: "No habia URLs pendientes.",
          },
        },
      };
    }

    emitDiagnostic({
      round: state.round,
      node,
      workerId,
      stage: "reserve",
      result: "ok",
      shortMessage: `URL reservada: ${reserved.normalizedUrl}`,
    });

    const reservedDomain = safeDomain(reserved.normalizedUrl);
    const domainCounts = reservedDomain ? { [reservedDomain]: 1 } : {};

    try {
      let scraped: ScrapedDocument;
      try {
        scraped = await runtime.scraper.scrape(reserved.normalizedUrl);
      } catch (error: unknown) {
        await safeMarkFailed(runtime.urlQueue, reserved.id, workerId);
        emitDiagnostic({
          round: state.round,
          node,
          workerId,
          stage: "scrape",
          result: "error",
          errorCode: resolveErrorCode(error, "SCRAPE_STAGE_FAILED"),
          shortMessage: resolveErrorShortMessage(error, `No se pudo scrapear ${reserved.normalizedUrl}.`),
        });

        await emitWorkerReport({
          workerId,
          round: state.round,
          node,
          status: "error",
          findingCreated: false,
          processedUrl: reserved.normalizedUrl,
          errorCode: resolveErrorCode(error, "SCRAPE_STAGE_FAILED"),
          note: "Fallo en scraping.",
        });

        return {
          workerOutcomes: {
            [workerId]: {
              workerId,
              round: state.round,
              node,
              processedUrl: reserved.normalizedUrl,
              findingCreated: false,
              note: "error",
              errorCode: resolveErrorCode(error, "SCRAPE_STAGE_FAILED"),
              reportNote: "Fallo en scraping.",
            },
          },
          domainCounts,
        };
      }

      emitDiagnostic({
        round: state.round,
        node,
        workerId,
        stage: "scrape",
        result: "ok",
        shortMessage: `Scrape OK; outgoingUrls=${scraped.outgoingUrls.length}`,
      });

      const scrapedQuality = evaluateScrapedContentQuality({
        title: scraped.title,
        summary: scraped.summary,
      });

      if (!scrapedQuality.passed) {
        await runtime.urlQueue.markProcessed(reserved.id, workerId);

        emitDiagnostic({
          round: state.round,
          node,
          workerId,
          stage: "extract",
          result: "skip",
          errorCode: scrapedQuality.reason,
          shortMessage: `Quality gate descarto URL (${scrapedQuality.reason}).`,
        });

        await emitWorkerReport({
          workerId,
          round: state.round,
          node,
          status: "processed",
          findingCreated: false,
          processedUrl: reserved.normalizedUrl,
          errorCode: scrapedQuality.reason,
          note: `URL descartada por quality gate: ${scrapedQuality.reason}.`,
        });

        return {
          workerOutcomes: {
            [workerId]: {
              workerId,
              round: state.round,
              node,
              processedUrl: reserved.normalizedUrl,
              findingCreated: false,
              note: "processed",
              errorCode: null,
              reportNote: `URL descartada por quality gate: ${scrapedQuality.reason}.`,
            },
          },
          domainCounts,
          discardedByReason: { [scrapedQuality.reason]: 1 },
        };
      }

      let generated: FindingDraft;
      try {
        generated = await runtime.llm.generateFinding({
          query: state.query,
          url: reserved.normalizedUrl,
          title: scraped.title,
          summary: scraped.summary,
        });
      } catch (error: unknown) {
        await safeMarkFailed(runtime.urlQueue, reserved.id, workerId);
        emitDiagnostic({
          round: state.round,
          node,
          workerId,
          stage: "extract",
          result: "error",
          errorCode: resolveErrorCode(error, "EXTRACT_STAGE_FAILED"),
          shortMessage: resolveErrorShortMessage(error, `No se pudo extraer finding para ${reserved.normalizedUrl}.`),
        });

        await emitWorkerReport({
          workerId,
          round: state.round,
          node,
          status: "error",
          findingCreated: false,
          processedUrl: reserved.normalizedUrl,
          errorCode: resolveErrorCode(error, "EXTRACT_STAGE_FAILED"),
          note: "Fallo en extraccion.",
        });

        return {
          workerOutcomes: {
            [workerId]: {
              workerId,
              round: state.round,
              node,
              processedUrl: reserved.normalizedUrl,
              findingCreated: false,
              note: "error",
              errorCode: resolveErrorCode(error, "EXTRACT_STAGE_FAILED"),
              reportNote: "Fallo en extraccion.",
            },
          },
          domainCounts,
        };
      }

      emitDiagnostic({
        round: state.round,
        node,
        workerId,
        stage: "extract",
        result: "ok",
        shortMessage: `Extraction OK: ${generated.title}`,
      });

      const findingQuality = evaluateFindingQuality(generated);
      if (!findingQuality.passed) {
        await runtime.urlQueue.markProcessed(reserved.id, workerId);

        emitDiagnostic({
          round: state.round,
          node,
          workerId,
          stage: "persist",
          result: "skip",
          errorCode: findingQuality.reason,
          shortMessage: `Finding descartado por calidad (${findingQuality.reason}).`,
        });

        await emitWorkerReport({
          workerId,
          round: state.round,
          node,
          status: "processed",
          findingCreated: false,
          processedUrl: reserved.normalizedUrl,
          errorCode: findingQuality.reason,
          note: `Finding descartado: ${findingQuality.reason}.`,
        });

        return {
          workerOutcomes: {
            [workerId]: {
              workerId,
              round: state.round,
              node,
              processedUrl: reserved.normalizedUrl,
              findingCreated: false,
              note: "processed",
              errorCode: null,
              reportNote: `Finding descartado: ${findingQuality.reason}.`,
            },
          },
          domainCounts,
          discardedByReason: { [findingQuality.reason]: 1 },
        };
      }

      try {
        await runtime.addFinding.execute(state.investigationId, {
          title: generated.title,
          summary: generated.summary,
          sourceUrl: reserved.normalizedUrl,
          confidence: generated.confidence,
          evidence: generated.evidence,
          gaps: generated.gaps,
        });

        await runtime.urlQueue.enqueueMany({
          investigationId: state.investigationId,
          urls: scraped.outgoingUrls,
          discoveredFrom: reserved.normalizedUrl,
        });

        await runtime.urlQueue.markProcessed(reserved.id, workerId);
      } catch (error: unknown) {
        await safeMarkFailed(runtime.urlQueue, reserved.id, workerId);
        emitDiagnostic({
          round: state.round,
          node,
          workerId,
          stage: "persist",
          result: "error",
          errorCode: resolveErrorCode(error, "PERSIST_STAGE_FAILED"),
          shortMessage: resolveErrorShortMessage(error, `No se pudo persistir finding para ${reserved.normalizedUrl}.`),
        });

        await emitWorkerReport({
          workerId,
          round: state.round,
          node,
          status: "error",
          findingCreated: false,
          processedUrl: reserved.normalizedUrl,
          errorCode: resolveErrorCode(error, "PERSIST_STAGE_FAILED"),
          note: "Fallo en persistencia.",
        });

        return {
          workerOutcomes: {
            [workerId]: {
              workerId,
              round: state.round,
              node,
              processedUrl: reserved.normalizedUrl,
              findingCreated: false,
              note: "error",
              errorCode: resolveErrorCode(error, "PERSIST_STAGE_FAILED"),
              reportNote: "Fallo en persistencia.",
            },
          },
          domainCounts,
        };
      }

      emitDiagnostic({
        round: state.round,
        node,
        workerId,
        stage: "persist",
        result: "ok",
        shortMessage: `Finding persistido para ${reserved.normalizedUrl}`,
      });

      await emitWorkerReport({
        workerId,
        round: state.round,
        node,
        status: "processed",
        findingCreated: true,
        processedUrl: reserved.normalizedUrl,
        note: "URL procesada y finding persistido.",
      });

      return {
        workerOutcomes: {
          [workerId]: {
            workerId,
            round: state.round,
            node,
            processedUrl: reserved.normalizedUrl,
            findingCreated: true,
            note: "processed",
            errorCode: null,
            reportNote: "URL procesada y finding persistido.",
          },
        },
        domainCounts,
      };
    } catch (error: unknown) {
      await safeMarkFailed(runtime.urlQueue, reserved.id, workerId);
      emitDiagnostic({
        round: state.round,
        node,
        workerId,
        stage: "persist",
        result: "error",
        errorCode: resolveErrorCode(error, "WORKER_UNEXPECTED_FAILURE"),
        shortMessage: resolveErrorShortMessage(error, "Fallo inesperado del worker."),
      });

      await emitWorkerReport({
        workerId,
        round: state.round,
        node,
        status: "error",
        findingCreated: false,
        processedUrl: reserved.normalizedUrl,
        errorCode: resolveErrorCode(error, "WORKER_UNEXPECTED_FAILURE"),
        note: "Fallo inesperado en worker.",
      });

      return {
        workerOutcomes: {
          [workerId]: {
            workerId,
            round: state.round,
            node,
            processedUrl: reserved.normalizedUrl,
            findingCreated: false,
            note: "error",
            errorCode: resolveErrorCode(error, "WORKER_UNEXPECTED_FAILURE"),
            reportNote: "Fallo inesperado en worker.",
          },
        },
        domainCounts,
      };
    }
  };

  const evaluateRound = async (state: GraphState) => {
    const decision = decideRoundContinuation({
      round: state.round,
      maxRounds: state.maxRounds,
      workerOutcomes: toWorkerOutcomes(state.workerOutcomes),
    });

    return {
      routeDecision: decision.next,
      terminationReason: decision.terminationReason,
    };
  };

  const connectFindings = async (state: GraphState) => {
    const investigation = await runtime.getInvestigationById.execute(state.investigationId);
    const connectionResult = deriveInvestigationFindingConnections(investigation.findings);
    const nextUpdatedAt = new Date().toISOString();

    await runtime.investigationRepository.save({
      ...investigation,
      findings: connectionResult.findings,
      findingConnections: connectionResult.connections,
      updatedAt: nextUpdatedAt,
    });

    await runtime.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_connections_updated",
        investigationId: investigation.id,
        persistedAt: nextUpdatedAt,
        payload: {
          connections: connectionResult.connections,
          updatedAt: nextUpdatedAt,
        },
      }),
    );

    return {};
  };

  const shouldContinue = (state: GraphState): "continue" | "synthesize" => {
    return state.routeDecision;
  };

  const synthesize = async (state: GraphState) => {
    const investigation = await runtime.getInvestigationById.execute(state.investigationId);
    const findingsCount = investigation.findings.length;
    const processedWorkers = toWorkerOutcomes(state.workerOutcomes).filter(
      (outcome) => outcome.findingCreated,
    ).length;

    return {
      finalSummary: `Investigacion finalizada con ${findingsCount} findings. Ultima ronda con ${processedWorkers}/${WORKER_IDS.length} workers productivos.`,
      terminationReason: state.terminationReason,
    };
  };

  return new StateGraph(InvestigationGraphState)
    .addNode("orchestrator", orchestrator)
    .addNode("worker_1", runWorker(WORKER_IDS[0], "worker_1"))
    .addNode("worker_2", runWorker(WORKER_IDS[1], "worker_2"))
    .addNode("worker_3", runWorker(WORKER_IDS[2], "worker_3"))
    .addNode("connect_findings", connectFindings)
    .addNode("round_router", evaluateRound)
    .addNode("synthesizer", synthesize)
    .addEdge("__start__", "orchestrator")
    .addEdge("orchestrator", "worker_1")
    .addEdge("orchestrator", "worker_2")
    .addEdge("orchestrator", "worker_3")
    .addEdge("worker_1", "connect_findings")
    .addEdge("worker_2", "connect_findings")
    .addEdge("worker_3", "connect_findings")
    .addEdge("connect_findings", "round_router")
    .addConditionalEdges("round_router", shouldContinue, {
      continue: "orchestrator",
      synthesize: "synthesizer",
    })
    .addEdge("synthesizer", "__end__")
    .compile();
}

export class InvestigationAgentGraphRunner {
  constructor(private readonly runtime: InvestigationGraphRuntime) {}

  async runInvestigation(investigationId: string, runId = randomUUID()): Promise<{ runId: string; summary: string }> {
    const normalizedId = parseInvestigationId(investigationId);
    const startedAtMs = performance.now();
    logInvestigationRun({
      requestId: runId,
      route: "investigation-runner",
      methodOrEvent: "run.start",
      statusOrResult: "accepted",
      durationMs: 0,
      metadata: {
        investigationId: normalizedId,
        runId,
      },
    });

    const investigation = await this.runtime.getInvestigationById.execute(normalizedId);

    const graph = buildInvestigationAgentGraph(this.runtime, {
      runId,
      investigationId: investigation.id,
    });

    await this.runtime.investigationRepository.save({
      ...investigation,
      status: "active",
      updatedAt: new Date().toISOString(),
    });

    await this.runtime.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.run_started",
        investigationId: investigation.id,
        persistedAt: new Date().toISOString(),
        payload: {
          runId,
          status: "active",
          startedAt: new Date().toISOString(),
        },
      }),
    );

    try {
      const result = await graph.invoke({
        investigationId: investigation.id,
        query: investigation.query,
        round: 0,
        maxRounds: MAX_ROUNDS,
        routeDecision: "continue",
        terminationReason: null,
        finalSummary: "",
        workerOutcomes: {},
        domainCounts: {},
        discardedByReason: {},
      }, {
        recursionLimit: this.runtime.langgraphRecursionLimit,
      });

      const workerOutcomes = toWorkerOutcomes(result.workerOutcomes);
      const workerReports = mapWorkerReports(workerOutcomes);
      const processedWorkers = workerOutcomes.filter((outcome) => outcome.note === "processed").length;
      const failedWorkers = workerOutcomes.filter((outcome) => outcome.note === "error").length;
      const idleWorkers = workerOutcomes.filter((outcome) => outcome.note === "idle").length;

      const diagnosticsSnapshot = this.runtime.diagnostics.getRunDiagnostics({
        investigationId: investigation.id,
        runId,
      });
      const runSummary = buildRunSummary({
        runId,
        totalWorkers: WORKER_IDS.length,
        findingsCount: (await this.runtime.getInvestigationById.execute(investigation.id)).findings.length,
        terminationReason: result.terminationReason ?? "no_progress",
        events: diagnosticsSnapshot?.events ?? [],
        qualityInput: {
          domainCounts: result.domainCounts ?? {},
          discardedByReason: result.discardedByReason ?? {},
        },
      });
      this.runtime.diagnostics.updateRunSummary({
        investigationId: investigation.id,
        runId,
        summary: runSummary,
      });

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.run_progress",
          investigationId: investigation.id,
          persistedAt: new Date().toISOString(),
          payload: {
            runId,
            round: result.round,
            maxRounds: result.maxRounds,
            processedWorkers,
            failedWorkers,
            idleWorkers,
          },
        }),
      );

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.run_summary",
          investigationId: investigation.id,
          persistedAt: new Date().toISOString(),
          payload: {
            runId,
            totalWorkers: runSummary.totalWorkers,
            productiveWorkers: runSummary.productiveWorkers,
            failedWorkers: runSummary.failedWorkers,
            findingsCount: runSummary.findingsCount,
            terminationReason: runSummary.terminationReason,
            termination_reason: runSummary.termination_reason,
            urlsReservedTotal: runSummary.urlsReservedTotal,
            urls_reserved_total: runSummary.urls_reserved_total,
            urlsProcessedTotal: runSummary.urlsProcessedTotal,
            urls_processed_total: runSummary.urls_processed_total,
            urlsFailedTotal: runSummary.urlsFailedTotal,
            urls_failed_total: runSummary.urls_failed_total,
            findingsCreatedTotal: runSummary.findingsCreatedTotal,
            findings_created_total: runSummary.findings_created_total,
            findingsPerRound: runSummary.findingsPerRound,
            findings_per_round: runSummary.findings_per_round,
            topFailureReasons: runSummary.topFailureReasons,
            quality: runSummary.quality,
          },
        }),
      );

      logInvestigationRun({
        requestId: runId,
        route: "investigation-runner",
        methodOrEvent: "run.progress",
        statusOrResult: "active",
        durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
        metadata: {
          investigationId: investigation.id,
          runId,
          round: result.round,
          maxRounds: result.maxRounds,
          processedWorkers,
          failedWorkers,
          idleWorkers,
        },
      });

      const latestInvestigation = await this.runtime.getInvestigationById.execute(investigation.id);
      const findingSynthesis = synthesizeFindings(latestInvestigation.findings);
      const finalReport = buildFinalInvestigationReport({
        runId,
        totalWorkers: WORKER_IDS.length,
        findingsCount: latestInvestigation.findings.length,
        terminationReason: runSummary.terminationReason,
        roundsExecuted: result.round,
        status: "completed",
        events: diagnosticsSnapshot?.events ?? [],
        workerReports,
        keyFindings: findingSynthesis.keyFindings,
        keyGaps: findingSynthesis.keyGaps,
        qualityInput: {
          domainCounts: result.domainCounts ?? {},
          discardedByReason: result.discardedByReason ?? {},
        },
      });
      const completedAt = new Date().toISOString();
      await this.runtime.investigationRepository.save({
        ...latestInvestigation,
        status: "completed",
        updatedAt: completedAt,
      });

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.final_report_ready",
          investigationId: investigation.id,
          persistedAt: completedAt,
          payload: {
            runId,
            executiveSummary: finalReport.executiveSummary,
            agentReports: finalReport.agentReports,
            keyFindings: finalReport.keyFindings,
            coverage: finalReport.coverage,
            termination: finalReport.termination,
            topFailureReasons: finalReport.topFailureReasons,
            quality: finalReport.quality,
            keyGaps: finalReport.keyGaps,
          },
        }),
      );

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.run_completed",
          investigationId: investigation.id,
          persistedAt: completedAt,
          payload: {
            runId,
            status: "completed",
            summary: result.finalSummary,
            findingsCount: latestInvestigation.findings.length,
            completedAt,
          },
        }),
      );

      logInvestigationRun({
        requestId: runId,
        route: "investigation-runner",
        methodOrEvent: "run.complete",
        statusOrResult: "completed",
        durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
        metadata: {
          investigationId: investigation.id,
          runId,
          findingsCount: latestInvestigation.findings.length,
          terminationReason: runSummary.terminationReason,
          totalWorkers: runSummary.totalWorkers,
          productiveWorkers: runSummary.productiveWorkers,
          failedWorkers: runSummary.failedWorkers,
          topFailureReasons: runSummary.topFailureReasons,
        },
      });

      return {
        runId,
        summary: result.finalSummary,
      };
    } catch (error: unknown) {
      const failedAt = new Date().toISOString();
      const latestInvestigation = await this.runtime.getInvestigationById.execute(investigation.id);
      await this.runtime.investigationRepository.save({
        ...latestInvestigation,
        status: "paused",
        updatedAt: failedAt,
      });

      const message =
        error instanceof Error ? error.message : "Fallo inesperado durante la corrida de investigacion.";
      const errorCode =
        error instanceof GraphRecursionError
          ? "LANGGRAPH_RECURSION_LIMIT"
          : error instanceof IntegrationError
            ? error.code
            : "INVESTIGATION_RUN_FAILED";
      const terminationReason = error instanceof GraphRecursionError ? "recursion_limit" : "error";
      const diagnosticsSnapshot = this.runtime.diagnostics.getRunDiagnostics({
        investigationId: investigation.id,
        runId,
      });
      const runSummary = buildRunSummary({
        runId,
        totalWorkers: WORKER_IDS.length,
        findingsCount: latestInvestigation.findings.length,
        terminationReason,
        events: diagnosticsSnapshot?.events ?? [],
        qualityInput: {
          domainCounts: {},
          discardedByReason: {},
        },
      });
      this.runtime.diagnostics.updateRunSummary({
        investigationId: investigation.id,
        runId,
        summary: runSummary,
      });
      const workerReports = mapWorkerReports(
        diagnosticsSnapshot?.events
          ? collectWorkerOutcomesFromDiagnostics(diagnosticsSnapshot.events)
          : [],
      );
      const failedSynthesis = synthesizeFindings(latestInvestigation.findings);
      const failedFinalReport = buildFinalInvestigationReport({
        runId,
        totalWorkers: WORKER_IDS.length,
        findingsCount: latestInvestigation.findings.length,
        terminationReason,
        roundsExecuted: Math.max(
          0,
          diagnosticsSnapshot?.events.length
            ? diagnosticsSnapshot.events[diagnosticsSnapshot.events.length - 1]?.round ?? 0
            : 0,
        ),
        status: "failed",
        events: diagnosticsSnapshot?.events ?? [],
        workerReports,
        keyFindings: failedSynthesis.keyFindings,
        keyGaps: failedSynthesis.keyGaps,
        qualityInput: {
          domainCounts: {},
          discardedByReason: {},
        },
      });

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.run_summary",
          investigationId: investigation.id,
          persistedAt: failedAt,
          payload: {
            runId,
            totalWorkers: runSummary.totalWorkers,
            productiveWorkers: runSummary.productiveWorkers,
            failedWorkers: runSummary.failedWorkers,
            findingsCount: runSummary.findingsCount,
            terminationReason: runSummary.terminationReason,
            termination_reason: runSummary.termination_reason,
            urlsReservedTotal: runSummary.urlsReservedTotal,
            urls_reserved_total: runSummary.urls_reserved_total,
            urlsProcessedTotal: runSummary.urlsProcessedTotal,
            urls_processed_total: runSummary.urls_processed_total,
            urlsFailedTotal: runSummary.urlsFailedTotal,
            urls_failed_total: runSummary.urls_failed_total,
            findingsCreatedTotal: runSummary.findingsCreatedTotal,
            findings_created_total: runSummary.findings_created_total,
            findingsPerRound: runSummary.findingsPerRound,
            findings_per_round: runSummary.findings_per_round,
            topFailureReasons: runSummary.topFailureReasons,
            quality: runSummary.quality,
          },
        }),
      );

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.final_report_ready",
          investigationId: investigation.id,
          persistedAt: failedAt,
          payload: {
            runId,
            executiveSummary: failedFinalReport.executiveSummary,
            agentReports: failedFinalReport.agentReports,
            keyFindings: failedFinalReport.keyFindings,
            coverage: failedFinalReport.coverage,
            termination: failedFinalReport.termination,
            topFailureReasons: failedFinalReport.topFailureReasons,
            quality: failedFinalReport.quality,
            keyGaps: failedFinalReport.keyGaps,
          },
        }),
      );

      await this.runtime.eventsPublisher.publish(
        createInvestigationDomainEvent({
          type: "investigation.run_failed",
          investigationId: investigation.id,
          persistedAt: failedAt,
          payload: {
            runId,
            status: "paused",
            errorCode,
            message,
            failedAt,
          },
        }),
      );

      logInvestigationRun({
        requestId: runId,
        route: "investigation-runner",
        methodOrEvent: "run.fail",
        statusOrResult: "failed",
        durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
        errorCode,
        metadata: {
          investigationId: investigation.id,
          runId,
          message,
        },
      });

      throw error;
    }
  }
}

export function decideRoundContinuation(input: {
  round: number;
  maxRounds: number;
  workerOutcomes: WorkerOutcome[];
}): {
  next: "continue" | "synthesize";
  terminationReason: "queue_exhausted" | "no_progress" | "max_rounds" | null;
} {
  if (input.round >= input.maxRounds) {
    return {
      next: "synthesize",
      terminationReason: "max_rounds",
    };
  }

  const hasFindings = input.workerOutcomes.some((outcome) => outcome.findingCreated);
  if (hasFindings) {
    return {
      next: "continue",
      terminationReason: null,
    };
  }

  const allIdle = input.workerOutcomes.length > 0 && input.workerOutcomes.every((outcome) => outcome.note === "idle");
  if (allIdle) {
    return {
      next: "synthesize",
      terminationReason: "queue_exhausted",
    };
  }

  const hadUsefulWork = input.workerOutcomes.some(
    (outcome) => typeof outcome.processedUrl === "string" || outcome.note === "error",
  );

  if (hadUsefulWork) {
    return {
      next: "continue",
      terminationReason: null,
    };
  }

  return {
    next: "synthesize",
    terminationReason: "no_progress",
  };
}

function toWorkerOutcomes(workerOutcomes: Record<string, WorkerOutcome>): WorkerOutcome[] {
  const values: WorkerOutcome[] = [];

  for (const key in workerOutcomes) {
    const item = workerOutcomes[key];
    if (item) {
      values.push(item);
    }
  }

  return values;
}

function mapWorkerReports(outcomes: WorkerOutcome[]): InvestigationWorkerReport[] {
  return outcomes
    .map((outcome) => ({
      workerId: outcome.workerId,
      round: outcome.round ?? 0,
      node: outcome.node ?? "unknown",
      status: outcome.note,
      findingCreated: outcome.findingCreated,
      processedUrl: outcome.processedUrl ?? null,
      errorCode: outcome.errorCode ?? null,
      note: outcome.reportNote ?? "sin detalle",
    }))
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
}

function collectWorkerOutcomesFromDiagnostics(events: InvestigationDiagnosticEvent[]): WorkerOutcome[] {
  const latestByWorker = new Map<string, WorkerOutcome>();

  for (const event of events) {
    if (!event.workerId) {
      continue;
    }

    if (event.stage === "reserve" && event.result === "skip") {
      latestByWorker.set(event.workerId, {
        workerId: event.workerId,
        round: event.round,
        node: event.node,
        findingCreated: false,
        note: "idle",
        errorCode: null,
        reportNote: event.shortMessage,
      });
      continue;
    }

    if (event.stage === "persist" && event.result === "ok") {
      latestByWorker.set(event.workerId, {
        workerId: event.workerId,
        round: event.round,
        node: event.node,
        findingCreated: true,
        note: "processed",
        errorCode: null,
        reportNote: event.shortMessage,
      });
      continue;
    }

    if (event.result === "error") {
      latestByWorker.set(event.workerId, {
        workerId: event.workerId,
        round: event.round,
        node: event.node,
        findingCreated: false,
        note: "error",
        errorCode: event.errorCode,
        reportNote: event.shortMessage,
      });
    }
  }

  return [...latestByWorker.values()];
}

function synthesizeFindings(
  findings: Array<{
    id: string;
    title: string;
    sourceUrl: string;
    summary: string;
    confidence?: "low" | "medium" | "high";
    gaps?: string[];
  }>,
): { keyFindings: InvestigationKeyFinding[]; keyGaps: string[] } {
  const keyFindings: InvestigationKeyFinding[] = [];
  const keyGaps = new Set<string>();

  for (const finding of findings) {
    const quality = evaluateFindingQuality({
      title: finding.title,
      summary: finding.summary,
      confidence: finding.confidence,
      evidence: [],
      gaps: finding.gaps ?? [],
    });

    for (const gap of finding.gaps ?? []) {
      const normalized = gap.trim();
      if (normalized.length > 0) {
        keyGaps.add(normalized);
      }
    }

    if (!quality.passed) {
      continue;
    }

    keyFindings.push({
      id: finding.id,
      title: finding.title,
      sourceUrl: finding.sourceUrl,
      summary: finding.summary,
      confidence: finding.confidence ?? "unknown",
    });

    if (keyFindings.length >= 5) {
      break;
    }
  }

  return {
    keyFindings,
    keyGaps: [...keyGaps].slice(0, 12),
  };
}

function dedupeUrls(urls: string[]): string[] {
  const unique = new Set<string>();
  for (const url of urls) {
    unique.add(url);
  }

  return [...unique];
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function mergeCounterMap(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = { ...left };

  for (const key in right) {
    const value = right[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    next[key] = (next[key] ?? 0) + value;
  }

  return next;
}

async function safeMarkFailed(
  queue: InvestigationUrlQueueRepository,
  queueItemId: string,
  workerId: WorkerId,
): Promise<void> {
  try {
    await queue.markFailed(queueItemId, workerId);
  } catch {
    // Best effort diagnostic flow: no-op.
  }
}

function resolveErrorCode(error: unknown, fallbackCode: string): string {
  if (error instanceof IntegrationError) {
    return error.code;
  }

  return fallbackCode;
}

function resolveErrorShortMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return shortenMessage(error.message);
  }

  return shortenMessage(fallbackMessage);
}

function shortenMessage(message: string): string {
  const normalized = message.trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177)}...`;
}

function parseInvestigationId(id: unknown): string {
  if (typeof id !== "string") {
    throw new ValidationError("El parametro 'id' es obligatorio y debe ser string.");
  }

  const normalizedId = id.trim();

  if (normalizedId.length === 0) {
    throw new ValidationError("El parametro 'id' no puede estar vacio.");
  }

  return normalizedId;
}
