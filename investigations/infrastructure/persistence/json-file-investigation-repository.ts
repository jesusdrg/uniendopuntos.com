import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  BLOCKED_SOURCE_REASON_CATEGORIES,
  type BlockedSource,
  type FindingCard,
  type Investigation,
} from "@/investigations/domain/entities/investigation";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

type InvestigationStore = {
  investigations: Investigation[];
};

const DEFAULT_STORE: InvestigationStore = {
  investigations: [],
};

export class JsonFileInvestigationRepository implements InvestigationRepository {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), "data", "investigations.json")) {
    this.filePath = filePath;
  }

  async save(investigation: Investigation): Promise<void> {
    const store = await this.readStore();
    const existingIndex = store.investigations.findIndex((item) => item.id === investigation.id);

    if (existingIndex >= 0) {
      store.investigations[existingIndex] = investigation;
    } else {
      store.investigations.push(investigation);
    }

    await this.writeStore(store);
  }

  async findById(id: string): Promise<Investigation | null> {
    const store = await this.readStore();
    const investigation = store.investigations.find((item) => item.id === id);

    return investigation ?? null;
  }

  async list(): Promise<Investigation[]> {
    const store = await this.readStore();

    return [...store.investigations].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);

      return rightTime - leftTime;
    });
  }

  async deleteById(id: string): Promise<boolean> {
    const store = await this.readStore();
    const nextInvestigations = store.investigations.filter((item) => item.id !== id);

    if (nextInvestigations.length === store.investigations.length) {
      return false;
    }

    await this.writeStore({ investigations: nextInvestigations });
    return true;
  }

  private async ensureStoreFile(): Promise<void> {
    const parentDirectory = dirname(this.filePath);
    await mkdir(parentDirectory, { recursive: true });

    try {
      await stat(this.filePath);
    } catch {
      await this.writeStore(DEFAULT_STORE);
    }
  }

  private async readStore(): Promise<InvestigationStore> {
    await this.ensureStoreFile();

    const rawContent = await readFile(this.filePath, "utf8");
    let parsedContent: unknown;

    try {
      parsedContent = JSON.parse(rawContent);
    } catch {
      throw new Error("No se pudo parsear data/investigations.json");
    }

    return this.parseStore(parsedContent);
  }

  private parseStore(raw: unknown): InvestigationStore {
    if (!raw || typeof raw !== "object") {
      throw new Error("Formato invalido en investigations store");
    }

    const rawStore = raw as { investigations?: unknown };

    if (!Array.isArray(rawStore.investigations)) {
      throw new Error("Formato invalido: investigations debe ser array");
    }

    return {
      investigations: (rawStore.investigations as unknown[])
        .map((item) => this.normalizeInvestigation(item))
        .filter((item): item is Investigation => item !== null),
    };
  }

  private normalizeInvestigation(raw: unknown): Investigation | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const item = raw as {
      id?: unknown;
      query?: unknown;
      status?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      findings?: unknown;
      findingConnections?: unknown;
      blockedSources?: unknown;
    };

    if (
      typeof item.id !== "string" ||
      typeof item.query !== "string" ||
      typeof item.status !== "string" ||
      typeof item.createdAt !== "string" ||
      typeof item.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      id: item.id,
      query: item.query,
      status: item.status as Investigation["status"],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      findings: this.normalizeFindings(item.findings),
      findingConnections: this.normalizeFindingConnections(item.findingConnections),
      blockedSources: this.normalizeBlockedSources(item.blockedSources),
    };
  }

  private normalizeFindings(raw: unknown): FindingCard[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item): FindingCard | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const finding = item as {
          id?: unknown;
          title?: unknown;
          sourceUrl?: unknown;
          url?: unknown;
          summary?: unknown;
          confidence?: unknown;
          evidence?: unknown;
          gaps?: unknown;
          relatedFindingIds?: unknown;
          sharedEntityKeys?: unknown;
          claimHashes?: unknown;
          createdAt?: unknown;
        };

        const sourceUrl = typeof finding.sourceUrl === "string" ? finding.sourceUrl : finding.url;

        if (
          typeof finding.id !== "string" ||
          typeof finding.title !== "string" ||
          typeof sourceUrl !== "string" ||
          typeof finding.summary !== "string" ||
          typeof finding.createdAt !== "string"
        ) {
          return null;
        }

        return {
          id: finding.id,
          title: finding.title,
          sourceUrl,
          summary: finding.summary,
          confidence: normalizeConfidence(finding.confidence),
          evidence: normalizeStringList(finding.evidence),
          gaps: normalizeStringList(finding.gaps),
          relatedFindingIds: normalizeStringList(finding.relatedFindingIds),
          sharedEntityKeys: normalizeStringList(finding.sharedEntityKeys),
          claimHashes: normalizeStringList(finding.claimHashes),
          createdAt: finding.createdAt,
        };
      })
      .filter((item): item is FindingCard => item !== null);
  }

  private normalizeBlockedSources(raw: unknown): BlockedSource[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item): BlockedSource | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const blocked = item as {
          id?: unknown;
          url?: unknown;
          reasonCategory?: unknown;
          reason?: unknown;
          note?: unknown;
          blockedAt?: unknown;
        };

        const reasonCategory =
          typeof blocked.reasonCategory === "string"
            ? blocked.reasonCategory
            : typeof blocked.reason === "string"
              ? "other"
              : undefined;

        const validReasonCategory =
          typeof reasonCategory === "string" &&
          BLOCKED_SOURCE_REASON_CATEGORIES.includes(
            reasonCategory as BlockedSource["reasonCategory"],
          );

        if (
          typeof blocked.id !== "string" ||
          typeof blocked.url !== "string" ||
          !validReasonCategory ||
          typeof blocked.blockedAt !== "string"
        ) {
          return null;
        }

        return {
          id: blocked.id,
          url: blocked.url,
          reasonCategory: reasonCategory as BlockedSource["reasonCategory"],
          note: typeof blocked.note === "string" ? blocked.note : undefined,
          blockedAt: blocked.blockedAt,
        };
      })
      .filter((item): item is BlockedSource => item !== null);
  }

  private normalizeFindingConnections(raw: unknown): Investigation["findingConnections"] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item): NonNullable<Investigation["findingConnections"]>[number] | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const connection = item as {
          id?: unknown;
          fromId?: unknown;
          toId?: unknown;
          score?: unknown;
          reason?: unknown;
          sharedEntityKeys?: unknown;
          sharedClaimHashes?: unknown;
        };

        if (
          typeof connection.id !== "string" ||
          typeof connection.fromId !== "string" ||
          typeof connection.toId !== "string" ||
          typeof connection.score !== "number" ||
          !Number.isFinite(connection.score) ||
          typeof connection.reason !== "string"
        ) {
          return null;
        }

        return {
          id: connection.id,
          fromId: connection.fromId,
          toId: connection.toId,
          score: connection.score,
          reason: connection.reason,
          sharedEntityKeys: normalizeStringList(connection.sharedEntityKeys),
          sharedClaimHashes: normalizeStringList(connection.sharedClaimHashes),
        };
      })
      .filter((item): item is NonNullable<Investigation["findingConnections"]>[number] => item !== null);
  }

  private async writeStore(store: InvestigationStore): Promise<void> {
    const payload = `${JSON.stringify(store, null, 2)}\n`;
    const tempPath = `${this.filePath}.tmp`;

    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, this.filePath);
  }
}

function normalizeConfidence(value: unknown): "low" | "medium" | "high" | undefined {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim();
    if (normalized.length === 0) {
      continue;
    }

    output.push(normalized);
  }

  return output;
}
