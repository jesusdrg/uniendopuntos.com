import type { FindingResponse, InvestigationStreamEvent } from "@/investigations/interfaces/web/contracts";
import type { InvestigationFindingConnectionResponse } from "@/investigations/interfaces/web/contracts";

type FindingEventPayload = {
  finding?: unknown;
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  sourceUrl?: unknown;
  createdAt?: unknown;
  parentFindingId?: unknown;
  relatedFindingId?: unknown;
  relatedToFindingId?: unknown;
  relatedFindingIds?: unknown;
  sharedEntityKeys?: unknown;
  claimHashes?: unknown;
  evidence?: unknown;
  gaps?: unknown;
};

type FindingRelationPayload = {
  id?: unknown;
  parentFindingId?: unknown;
  relatedFindingId?: unknown;
  relatedToFindingId?: unknown;
  relatedFindingIds?: unknown;
};

type FindingConnectionsUpdatedPayload = {
  connections?: unknown;
};

type FindingConnectionPayload = {
  id?: unknown;
  fromId?: unknown;
  toId?: unknown;
  score?: unknown;
  reason?: unknown;
};

export type FindingSourceType = "fuente" | "blog" | "noticia";

export type FindingBoardCard = {
  id: string;
  title: string;
  summary: string;
  evidence: string[];
  gaps: string[];
  sourceDomain: string;
  sourceType: FindingSourceType;
  sourceUrl: string;
  timestamp: string;
};

export type FindingBoardConnection = {
  id: string;
  fromId: string;
  toId: string;
  reason: "semantic" | "timeline_fallback";
};

export function buildFindingBoardCards(
  initialFindings: FindingResponse[],
  events: InvestigationStreamEvent[],
): FindingBoardCard[] {
  const cardsById = new Map<string, FindingBoardCard>();

  for (const finding of initialFindings) {
    const card = findingToCard(finding, finding.createdAt);
    cardsById.set(card.id, card);
  }

  for (const event of events) {
    if (!isFindingAddedEvent(event.type)) {
      continue;
    }

    const card = findingEventToCard(event);
    if (!card) {
      continue;
    }

    cardsById.set(card.id, card);
  }

  return [...cardsById.values()].sort((a, b) => {
    const diff = toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
    if (diff !== 0) {
      return diff;
    }

    return a.id.localeCompare(b.id);
  });
}

export function buildFindingBoardConnections(
  initialFindings: FindingResponse[],
  events: InvestigationStreamEvent[],
  initialConnections: InvestigationFindingConnectionResponse[] = [],
): FindingBoardConnection[] {
  const cards = buildFindingBoardCards(initialFindings, events);
  if (cards.length < 2) {
    return [];
  }

  const cardsById = new Set(cards.map((card) => card.id));
  const byTimeAsc = [...cards].sort((a, b) => {
    const diff = toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp);
    if (diff !== 0) {
      return diff;
    }

    return a.id.localeCompare(b.id);
  });

  const edgeMap = new Map<string, FindingBoardConnection>();
  const semanticNodeIds = new Set<string>();
  const eventsByTimeAsc = [...events].sort((a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp));

  for (const connection of initialConnections) {
    addSemanticEdge(edgeMap, cardsById, semanticNodeIds, connection.fromId, connection.toId);
  }

  for (const finding of initialFindings) {
    for (const relatedId of toStringArray((finding as FindingRelationPayload).relatedFindingIds)) {
      if (relatedId !== finding.id) {
        addSemanticEdge(edgeMap, cardsById, semanticNodeIds, finding.id, relatedId);
      }
    }
  }

  for (const event of eventsByTimeAsc) {
    if (isFindingConnectionsUpdatedEvent(event.type)) {
      const payload = toRecord(event.rawPayload) as FindingConnectionsUpdatedPayload;
      for (const connection of toConnectionPayloadList(payload.connections)) {
        addSemanticEdge(edgeMap, cardsById, semanticNodeIds, connection.fromId, connection.toId);
      }
      continue;
    }

    if (!isFindingAddedEvent(event.type)) {
      continue;
    }

    const payload = toRecord(event.rawPayload) as FindingEventPayload;
    const findingPayload = payload.finding ? (toRecord(payload.finding) as FindingRelationPayload) : payload;
    const currentFindingId =
      toNonEmptyString(findingPayload.id) ?? toNonEmptyString((payload as FindingRelationPayload).id);
    const relatedFindingId =
      toNonEmptyString(findingPayload.parentFindingId) ??
      toNonEmptyString(findingPayload.relatedFindingId) ??
      toNonEmptyString(findingPayload.relatedToFindingId) ??
      toNonEmptyString(payload.parentFindingId) ??
      toNonEmptyString(payload.relatedFindingId) ??
      toNonEmptyString(payload.relatedToFindingId);

    for (const relatedId of toStringArray(findingPayload.relatedFindingIds)) {
      addSemanticEdge(edgeMap, cardsById, semanticNodeIds, currentFindingId ?? "", relatedId);
    }

    if (!currentFindingId || !relatedFindingId || currentFindingId === relatedFindingId) {
      continue;
    }

    addSemanticEdge(edgeMap, cardsById, semanticNodeIds, relatedFindingId, currentFindingId);
  }

  for (let index = 0; index < byTimeAsc.length; index += 1) {
    const current = byTimeAsc[index];
    if (!current || semanticNodeIds.has(current.id)) {
      continue;
    }

    const previous = byTimeAsc[index - 1];
    const next = byTimeAsc[index + 1];

    if (previous && previous.id !== current.id) {
      addEdge(edgeMap, cardsById, previous.id, current.id, "timeline_fallback");
      continue;
    }

    if (next && next.id !== current.id) {
      addEdge(edgeMap, cardsById, current.id, next.id, "timeline_fallback");
    }
  }

  return [...edgeMap.values()];
}

function addSemanticEdge(
  edgeMap: Map<string, FindingBoardConnection>,
  validNodeIds: Set<string>,
  semanticNodeIds: Set<string>,
  leftId: string,
  rightId: string,
): void {
  if (!validNodeIds.has(leftId) || !validNodeIds.has(rightId) || leftId === rightId) {
    return;
  }

  const ordered = [leftId, rightId].sort((a, b) => a.localeCompare(b));
  const fromId = ordered[0] ?? leftId;
  const toId = ordered[1] ?? rightId;

  addEdge(edgeMap, validNodeIds, fromId, toId, "semantic");
  semanticNodeIds.add(fromId);
  semanticNodeIds.add(toId);
}

function findingEventToCard(event: InvestigationStreamEvent): FindingBoardCard | null {
  const payload = toRecord(event.rawPayload) as FindingEventPayload;
  const candidate = payload.finding ? toRecord(payload.finding) : payload;

  const id = toNonEmptyString(candidate.id) ?? toNonEmptyString(payload.id);
  const title = toNonEmptyString(candidate.title) ?? toNonEmptyString(payload.title);
  const summary = toNonEmptyString(candidate.summary) ?? toNonEmptyString(payload.summary);
  const sourceUrl = toNonEmptyString(candidate.sourceUrl) ?? toNonEmptyString(payload.sourceUrl);

  if (!id || !title || !summary || !sourceUrl) {
    return null;
  }

  const timestamp =
    toIsoString(candidate.createdAt) ??
    toIsoString(payload.createdAt) ??
    toIsoString(event.timestamp) ??
    new Date().toISOString();

  return {
    id,
    title,
    summary,
    evidence: toStringArray(candidate.evidence),
    gaps: toStringArray(candidate.gaps),
    sourceUrl,
    sourceDomain: sourceDomainFromUrl(sourceUrl),
    sourceType: sourceTypeFromUrl(sourceUrl),
    timestamp,
  };
}

function findingToCard(finding: FindingResponse, fallbackTimestamp: string): FindingBoardCard {
  const timestamp = toIsoString(finding.createdAt) ?? toIsoString(fallbackTimestamp) ?? new Date().toISOString();

  return {
    id: finding.id,
    title: finding.title,
    summary: finding.summary,
    evidence: toStringArray(finding.evidence),
    gaps: toStringArray(finding.gaps),
    sourceUrl: finding.sourceUrl,
    sourceDomain: sourceDomainFromUrl(finding.sourceUrl),
    sourceType: sourceTypeFromUrl(finding.sourceUrl),
    timestamp,
  };
}

function sourceTypeFromUrl(value: string): FindingSourceType {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const combined = `${host}${path}`;

    if (combined.includes("blog")) {
      return "blog";
    }

    if (
      combined.includes("news") ||
      combined.includes("noticia") ||
      combined.includes("boletin") ||
      combined.includes("infobae") ||
      combined.includes("clarin") ||
      combined.includes("lanacion")
    ) {
      return "noticia";
    }

    return "fuente";
  } catch {
    return "fuente";
  }
}

function addEdge(
  edgeMap: Map<string, FindingBoardConnection>,
  validNodeIds: Set<string>,
  fromId: string,
  toId: string,
  reason: FindingBoardConnection["reason"],
): void {
  if (!validNodeIds.has(fromId) || !validNodeIds.has(toId) || fromId === toId) {
    return;
  }

  const id = `${fromId}->${toId}`;
  edgeMap.set(id, {
    id,
    fromId,
    toId,
    reason,
  });
}

function sourceDomainFromUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname;
  } catch {
    return value;
  }
}

function toConnectionPayloadList(value: unknown): Array<{ fromId: string; toId: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: Array<{ fromId: string; toId: string }> = [];
  for (const item of value) {
    const connection = toRecord(item) as FindingConnectionPayload;
    const fromId = toNonEmptyString(connection.fromId);
    const toId = toNonEmptyString(connection.toId);
    if (!fromId || !toId || fromId === toId) {
      continue;
    }
    output.push({ fromId, toId });
  }

  return output;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: string[] = [];
  for (const item of value) {
    const normalized = toNonEmptyString(item);
    if (!normalized) {
      continue;
    }
    output.push(normalized);
  }

  return output;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function toIsoString(value: unknown): string | null {
  const normalized = toNonEmptyString(value);
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function toTimestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

function isFindingAddedEvent(type: string): boolean {
  return type === "investigation.finding_added" || type === "finding_added";
}

function isFindingConnectionsUpdatedEvent(type: string): boolean {
  return type === "investigation.finding_connections_updated" || type === "finding_connections_updated";
}
