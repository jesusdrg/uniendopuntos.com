import { createHash } from "node:crypto";

import type {
  FindingCard,
  InvestigationFindingConnection,
} from "@/investigations/domain/entities/investigation";

const MAX_ENTITY_KEYS_PER_FINDING = 8;
const MAX_CLAIM_HASHES_PER_FINDING = 6;
const MAX_POSTINGS_PER_KEY = 30;
const TOP_CONNECTIONS_PER_FINDING = 3;

const STOPWORDS = new Set([
  "para",
  "como",
  "desde",
  "hasta",
  "sobre",
  "entre",
  "donde",
  "cuando",
  "porque",
  "aunque",
  "the",
  "that",
  "with",
  "from",
  "this",
  "were",
  "have",
  "sobre",
  "segun",
  "documento",
  "finding",
  "hallazgo",
]);

export function deriveInvestigationFindingConnections(findings: FindingCard[]): {
  findings: FindingCard[];
  connections: InvestigationFindingConnection[];
} {
  if (findings.length === 0) {
    return { findings: [], connections: [] };
  }

  const normalizedFindings = findings.map((finding) => normalizeFindingHints(finding));
  const byId = new Map(normalizedFindings.map((finding) => [finding.id, finding]));

  const entityIndex = buildIndex(normalizedFindings, (finding) => finding.sharedEntityKeys ?? []);
  const claimIndex = buildIndex(normalizedFindings, (finding) => finding.claimHashes ?? []);

  const edgeMap = new Map<string, InvestigationFindingConnection>();

  for (const finding of normalizedFindings) {
    const candidateIds = collectCandidateIds(finding, entityIndex, claimIndex, byId);
    const scored: InvestigationFindingConnection[] = [];

    for (const candidateId of candidateIds) {
      const target = byId.get(candidateId);
      if (!target) {
        continue;
      }

      const connection = scoreConnection(finding, target);
      if (!connection) {
        continue;
      }

      scored.push(connection);
    }

    scored
      .sort((left, right) => {
        const scoreDiff = right.score - left.score;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, TOP_CONNECTIONS_PER_FINDING)
      .forEach((connection) => {
        const existing = edgeMap.get(connection.id);
        if (!existing || connection.score > existing.score) {
          edgeMap.set(connection.id, connection);
        }
      });
  }

  const connections = [...edgeMap.values()].sort((left, right) => {
    const scoreDiff = right.score - left.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return left.id.localeCompare(right.id);
  });

  const connectedIds = new Map<string, Array<{ id: string; score: number }>>();
  for (const connection of connections) {
    const left = connectedIds.get(connection.fromId) ?? [];
    left.push({ id: connection.toId, score: connection.score });
    connectedIds.set(connection.fromId, left);

    const right = connectedIds.get(connection.toId) ?? [];
    right.push({ id: connection.fromId, score: connection.score });
    connectedIds.set(connection.toId, right);
  }

  const findingsWithRelations = normalizedFindings.map((finding) => {
    const related = connectedIds.get(finding.id) ?? [];
    const relatedFindingIds = related
      .sort((left, right) => right.score - left.score)
      .slice(0, TOP_CONNECTIONS_PER_FINDING)
      .map((item) => item.id);

    return {
      ...finding,
      relatedFindingIds,
    };
  });

  return {
    findings: findingsWithRelations,
    connections,
  };
}

function normalizeFindingHints(finding: FindingCard): FindingCard {
  const sharedEntityKeys = normalizeStringList(finding.sharedEntityKeys);
  const claimHashes = normalizeStringList(finding.claimHashes);

  return {
    ...finding,
    sharedEntityKeys:
      sharedEntityKeys.length > 0
        ? sharedEntityKeys.slice(0, MAX_ENTITY_KEYS_PER_FINDING)
        : extractEntityKeys(finding).slice(0, MAX_ENTITY_KEYS_PER_FINDING),
    claimHashes:
      claimHashes.length > 0
        ? claimHashes.slice(0, MAX_CLAIM_HASHES_PER_FINDING)
        : extractClaimHashes(finding).slice(0, MAX_CLAIM_HASHES_PER_FINDING),
    relatedFindingIds: normalizeStringList(finding.relatedFindingIds),
  };
}

function buildIndex(
  findings: FindingCard[],
  pickKeys: (finding: FindingCard) => string[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const finding of findings) {
    const keys = pickKeys(finding);

    for (const key of keys) {
      const bucket = index.get(key) ?? [];
      if (bucket.length >= MAX_POSTINGS_PER_KEY) {
        continue;
      }
      bucket.push(finding.id);
      index.set(key, bucket);
    }
  }

  return index;
}

function collectCandidateIds(
  finding: FindingCard,
  entityIndex: Map<string, string[]>,
  claimIndex: Map<string, string[]>,
  byId: Map<string, FindingCard>,
): Set<string> {
  const candidates = new Set<string>();

  for (const key of finding.sharedEntityKeys ?? []) {
    const postings = entityIndex.get(key);
    if (!postings) {
      continue;
    }
    for (const id of postings) {
      if (id !== finding.id) {
        candidates.add(id);
      }
    }
  }

  for (const hash of finding.claimHashes ?? []) {
    const postings = claimIndex.get(hash);
    if (!postings) {
      continue;
    }
    for (const id of postings) {
      if (id !== finding.id) {
        candidates.add(id);
      }
    }
  }

  for (const relatedId of finding.relatedFindingIds ?? []) {
    if (relatedId !== finding.id && byId.has(relatedId)) {
      candidates.add(relatedId);
    }
  }

  return candidates;
}

function scoreConnection(left: FindingCard, right: FindingCard): InvestigationFindingConnection | null {
  const leftEntities = new Set(left.sharedEntityKeys ?? []);
  const rightEntities = new Set(right.sharedEntityKeys ?? []);
  const sharedEntities = [...leftEntities].filter((key) => rightEntities.has(key));

  const leftClaims = new Set(left.claimHashes ?? []);
  const rightClaims = new Set(right.claimHashes ?? []);
  const sharedClaims = [...leftClaims].filter((key) => rightClaims.has(key));

  const explicitRelation =
    (left.relatedFindingIds ?? []).includes(right.id) || (right.relatedFindingIds ?? []).includes(left.id);

  if (!explicitRelation && sharedEntities.length === 0 && sharedClaims.length === 0) {
    return null;
  }

  const claimScore = sharedClaims.length > 0 ? 0.55 : 0;
  const entityScore = Math.min(sharedEntities.length, 3) * 0.1;
  const explicitScore = explicitRelation ? 0.15 : 0;
  const score = Number(Math.min(0.99, claimScore + entityScore + explicitScore).toFixed(3));

  const ids = [left.id, right.id].sort((a, b) => a.localeCompare(b));
  const fromId = ids[0] ?? left.id;
  const toId = ids[1] ?? right.id;
  const reasonParts: string[] = [];

  if (sharedClaims.length > 0) {
    reasonParts.push(`shared_claims:${sharedClaims.length}`);
  }
  if (sharedEntities.length > 0) {
    reasonParts.push(`shared_entities:${sharedEntities.length}`);
  }
  if (explicitRelation) {
    reasonParts.push("explicit_related_id");
  }

  return {
    id: `${fromId}<->${toId}`,
    fromId,
    toId,
    score,
    reason: reasonParts.join("|"),
    sharedEntityKeys: sharedEntities.slice(0, 5),
    sharedClaimHashes: sharedClaims.slice(0, 5),
  };
}

function extractEntityKeys(finding: FindingCard): string[] {
  const text = `${finding.title} ${finding.summary}`;
  const tokens = text.toLowerCase().match(/[a-z0-9áéíóúñ]{4,}/g) ?? [];
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (STOPWORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map((entry) => entry[0])
    .slice(0, MAX_ENTITY_KEYS_PER_FINDING);
}

function extractClaimHashes(finding: FindingCard): string[] {
  const claimTexts = [finding.summary, ...(finding.evidence ?? [])]
    .flatMap((value) => value.split(/[.!?\n]/g))
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 24)
    .slice(0, MAX_CLAIM_HASHES_PER_FINDING);

  return claimTexts.map((text) => createHash("sha1").update(text).digest("hex").slice(0, 12));
}

function normalizeStringList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = normalizeText(item);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
