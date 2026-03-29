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

  private async writeStore(store: InvestigationStore): Promise<void> {
    const payload = `${JSON.stringify(store, null, 2)}\n`;
    const tempPath = `${this.filePath}.tmp`;

    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, this.filePath);
  }
}
