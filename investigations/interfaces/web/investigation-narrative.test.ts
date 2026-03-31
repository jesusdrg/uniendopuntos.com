import { describe, expect, it } from "bun:test";

import type {
  InvestigationFinalReport,
  InvestigationRunSummary,
  InvestigationRunState,
} from "@/investigations/interfaces/web/contracts";
import type {
  FindingBoardCard,
  FindingBoardConnection,
} from "@/investigations/interfaces/web/finding-board";
import {
  buildInvestigationNarrative,
  resolveSelectedFindingCard,
} from "@/investigations/interfaces/web/investigation-narrative";

describe("buildInvestigationNarrative", () => {
  it("prioritizes structured executive summary and semantic connections", () => {
    const report = finalReport({ executiveSummary: "Se confirma patron de triangulacion." });
    const cards = [
      card({ id: "f-1", title: "Empresa A", summary: "Recibe pagos", sourceUrl: "https://a.test/doc" }),
      card({ id: "f-2", title: "Empresa B", summary: "Subcontrata", sourceUrl: "https://b.test/doc" }),
    ];
    const connections: FindingBoardConnection[] = [
      { id: "f-1->f-2", fromId: "f-1", toId: "f-2", reason: "semantic" },
    ];

    const narrative = buildInvestigationNarrative({
      runState: runState(),
      structuredReport: report,
      findingCards: cards,
      findingConnections: connections,
    });

    expect(narrative.executiveConclusion).toBe("Se confirma patron de triangulacion.");
    expect(narrative.keyConnections[0]).toContain("Empresa A conecta con Empresa B");
    expect(narrative.mainEvidence[0]).toContain("fuente:");
  });

  it("falls back to run summary when structured report is missing", () => {
    const narrative = buildInvestigationNarrative({
      runState: runState({ summaryMessage: "Corrida completada sin resumen estructurado." }),
      structuredReport: null,
      findingCards: [
        card({
          id: "f-1",
          title: "Boletin oficial",
          summary: "Hay evidencia documental",
          sourceUrl: "https://boletin.test/nota",
          evidence: ["Acta 120"],
        }),
      ],
      findingConnections: [],
    });

    expect(narrative.executiveConclusion).toBe("Corrida completada sin resumen estructurado.");
    expect(narrative.keyConnections[0]).toContain("No se detectaron conexiones");
    expect(narrative.mainEvidence[0]).toContain("1 evidencia");
  });

  it("includes finding gaps and failure reasons as uncertainties", () => {
    const narrative = buildInvestigationNarrative({
      runState: runState({
        runSummary: {
          ...baseRunSummary(),
          topFailureReasons: [{ errorCode: "INTEGRATION_TIMEOUT", count: 2 }],
        },
      }),
      structuredReport: null,
      findingCards: [
        card({
          id: "f-gap",
          title: "Contrato sin adenda",
          summary: "Falta confirmar adenda",
          sourceUrl: "https://docs.test/contrato",
          gaps: ["Falta adenda firmada."],
        }),
      ],
      findingConnections: [],
    });

    expect(narrative.uncertainties).toContain("Falta adenda firmada.");
    expect(narrative.uncertainties.some((line) => line.includes("INTEGRATION_TIMEOUT"))).toBeTrue();
  });
});

describe("resolveSelectedFindingCard", () => {
  it("returns selected card when id exists", () => {
    const cards = [card({ id: "f-1", title: "uno", summary: "s", sourceUrl: "https://one.test/a" })];

    const selected = resolveSelectedFindingCard(cards, "f-1");

    expect(selected?.id).toBe("f-1");
  });

  it("returns null for missing or null selection", () => {
    const cards = [card({ id: "f-1", title: "uno", summary: "s", sourceUrl: "https://one.test/a" })];

    expect(resolveSelectedFindingCard(cards, null)).toBeNull();
    expect(resolveSelectedFindingCard(cards, "missing")).toBeNull();
  });
});

function card(input: {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  evidence?: string[];
  gaps?: string[];
}): FindingBoardCard {
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    sourceUrl: input.sourceUrl,
    sourceDomain: new URL(input.sourceUrl).hostname,
    sourceType: "fuente",
    timestamp: "2026-03-30T12:00:00.000Z",
    evidence: input.evidence ?? [],
    gaps: input.gaps ?? [],
  };
}

function finalReport(overrides?: Partial<InvestigationFinalReport>): InvestigationFinalReport {
  return {
    runId: "run-1",
    executiveSummary: "Resumen",
    agentReports: [],
    keyFindings: [
      {
        id: "f-1",
        title: "Hallazgo principal",
        sourceUrl: "https://example.test/f1",
        confidence: "high",
        summary: "Hay coincidencia documental.",
      },
    ],
    coverage: {
      totalWorkers: 4,
      workersReported: 4,
      productiveWorkers: 2,
      failedWorkers: 1,
      idleWorkers: 1,
      urlsReservedTotal: 10,
      urlsProcessedTotal: 6,
      urlsFailedTotal: 1,
      findingsCreatedTotal: 3,
      findingsCoverageRatio: 0.5,
    },
    termination: {
      status: "completed",
      reason: "max_rounds",
      roundsExecuted: 3,
    },
    topFailureReasons: [],
    quality: {
      uniqueDomainsCount: 2,
      topDomain: "example.test",
      topDomainShare: 0.5,
      urlsDiscardedByQuality: 0,
      discardedByReason: [],
    },
    keyGaps: [],
    ...overrides,
  };
}

function runState(overrides?: Partial<InvestigationRunState>): InvestigationRunState {
  return {
    status: "completed",
    runId: "run-1",
    startedAt: "2026-03-30T12:00:00.000Z",
    endedAt: "2026-03-30T12:10:00.000Z",
    progress: {
      round: 3,
      maxRounds: 3,
      processedWorkers: 3,
      failedWorkers: 1,
    },
    summaryMessage: "Resumen fallback",
    runSummary: baseRunSummary(),
    finalReport: null,
    ...overrides,
  };
}

function baseRunSummary(): InvestigationRunSummary {
  return {
    runId: "run-1",
    totalWorkers: 4,
    productiveWorkers: 3,
    failedWorkers: 1,
    findingsCount: 3,
    terminationReason: "max_rounds",
    urlsReservedTotal: 10,
    urlsProcessedTotal: 6,
    urlsFailedTotal: 1,
    findingsCreatedTotal: 3,
    findingsPerRound: [1, 1, 1],
    termination_reason: "max_rounds",
    urls_reserved_total: 10,
    urls_processed_total: 6,
    urls_failed_total: 1,
    findings_created_total: 3,
    findings_per_round: [1, 1, 1],
    topFailureReasons: [],
    quality: {
      uniqueDomainsCount: 2,
      topDomain: "example.test",
      topDomainShare: 0.5,
      urlsDiscardedByQuality: 0,
      discardedByReason: [],
    },
  };
}
