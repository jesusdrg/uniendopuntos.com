import type {
  InvestigationFinalReport,
  InvestigationRunState,
} from "@/investigations/interfaces/web/contracts";
import type {
  FindingBoardCard,
  FindingBoardConnection,
} from "@/investigations/interfaces/web/finding-board";

type BuildInvestigationNarrativeInput = {
  runState: InvestigationRunState;
  structuredReport: InvestigationFinalReport | null;
  findingCards: FindingBoardCard[];
  findingConnections: FindingBoardConnection[];
};

export type InvestigationNarrative = {
  executiveConclusion: string;
  keyConnections: string[];
  mainEvidence: string[];
  uncertainties: string[];
};

const MAX_KEY_CONNECTIONS = 5;
const MAX_MAIN_EVIDENCE = 6;
const MAX_UNCERTAINTIES = 6;

export function buildInvestigationNarrative(
  input: BuildInvestigationNarrativeInput,
): InvestigationNarrative {
  const executiveConclusion =
    input.structuredReport?.executiveSummary ??
    input.runState.summaryMessage ??
    "No hay una conclusion consolidada todavia.";

  return {
    executiveConclusion,
    keyConnections: buildKeyConnections(input.findingCards, input.findingConnections),
    mainEvidence: buildMainEvidence(input),
    uncertainties: buildUncertainties(input),
  };
}

export function resolveSelectedFindingCard(
  cards: FindingBoardCard[],
  selectedCardId: string | null,
): FindingBoardCard | null {
  if (!selectedCardId) {
    return null;
  }

  return cards.find((card) => card.id === selectedCardId) ?? null;
}

function buildKeyConnections(cards: FindingBoardCard[], connections: FindingBoardConnection[]): string[] {
  if (connections.length === 0) {
    return ["No se detectaron conexiones explicitas entre hallazgos."];
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const semantic = connections.filter((connection) => connection.reason === "semantic");
  const base = semantic.length > 0 ? semantic : connections;

  const lines: string[] = [];
  for (const connection of base.slice(0, MAX_KEY_CONNECTIONS)) {
    const fromTitle = cardById.get(connection.fromId)?.title ?? connection.fromId;
    const toTitle = cardById.get(connection.toId)?.title ?? connection.toId;
    const why =
      connection.reason === "semantic"
        ? "comparte entidades o claims relevantes"
        : "mantiene continuidad temporal por falta de relacion semantica";
    lines.push(`${fromTitle} conecta con ${toTitle} porque ${why}.`);
  }

  return lines;
}

function buildMainEvidence(input: BuildInvestigationNarrativeInput): string[] {
  const lines: string[] = [];

  for (const finding of input.structuredReport?.keyFindings ?? []) {
    lines.push(`${finding.title}: ${finding.summary} (fuente: ${finding.sourceUrl}).`);
    if (lines.length >= MAX_MAIN_EVIDENCE) {
      return lines;
    }
  }

  for (const card of input.findingCards) {
    const evidenceCount = card.evidence.length;
    if (evidenceCount > 0) {
      lines.push(`${card.title}: ${evidenceCount} evidencia(s) disponible(s) desde ${card.sourceDomain}.`);
    } else {
      lines.push(`${card.title}: respaldo en ${card.sourceDomain}.`);
    }

    if (lines.length >= MAX_MAIN_EVIDENCE) {
      break;
    }
  }

  if (lines.length === 0) {
    return ["No hay evidencia principal consolidada para esta corrida."];
  }

  return lines;
}

function buildUncertainties(input: BuildInvestigationNarrativeInput): string[] {
  const lines: string[] = [];
  const uniqueGaps = new Set<string>();

  for (const card of input.findingCards) {
    for (const gap of card.gaps) {
      if (uniqueGaps.has(gap)) {
        continue;
      }

      uniqueGaps.add(gap);
      lines.push(gap);
      if (lines.length >= MAX_UNCERTAINTIES) {
        return lines;
      }
    }
  }

  for (const reason of input.structuredReport?.topFailureReasons ?? input.runState.runSummary?.topFailureReasons ?? []) {
    lines.push(`Riesgo operativo: ${reason.errorCode} aparece ${reason.count} vez/veces.`);
    if (lines.length >= MAX_UNCERTAINTIES) {
      return lines;
    }
  }

  if (input.findingCards.length === 0) {
    lines.push("La corrida no produjo hallazgos, por lo que quedan hipotesis sin validar.");
  }

  if (lines.length === 0) {
    lines.push("No se reportaron gaps explicitos; validar manualmente supuestos criticos.");
  }

  return lines;
}
