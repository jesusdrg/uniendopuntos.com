import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type {
  EnqueueUrlsInput,
  EnqueueUrlsResult,
  InvestigationUrlQueueRepository,
  ReservedInvestigationUrl,
} from "@/investigations/domain/ports/investigation-url-queue-repository";
import type { InvestigationDatabase } from "@/investigations/infrastructure/persistence/postgres/postgres-client";
import { investigationUrlQueueTable } from "@/investigations/infrastructure/persistence/postgres/schema";
import { normalizedUrlHash } from "@/investigations/infrastructure/persistence/normalized-url-hash";
import { normalizeUrl } from "@/investigations/infrastructure/persistence/url-normalizer";
import { rankQueueCandidates } from "@/investigations/application/services/research-quality";

export class DrizzleSqlInvestigationUrlQueueRepository implements InvestigationUrlQueueRepository {
  constructor(
    private readonly database: InvestigationDatabase,
    private readonly hashNormalizedUrl: (normalizedUrl: string) => string = normalizedUrlHash,
  ) {}

  async enqueueMany(input: EnqueueUrlsInput): Promise<EnqueueUrlsResult> {
    const normalizedUrlsByHash = new Map<string, string>();

    for (const url of input.urls) {
      const normalizedUrl = normalizeUrl(url);
      const hash = this.hashNormalizedUrl(normalizedUrl);

      if (!normalizedUrlsByHash.has(hash)) {
        normalizedUrlsByHash.set(hash, normalizedUrl);
      }
    }

    if (normalizedUrlsByHash.size === 0) {
      return { inserted: 0, deduped: 0 };
    }

    const now = new Date().toISOString();
    const values = [...normalizedUrlsByHash.entries()].map(([normalizedUrlHashValue, normalizedUrl]) => ({
      id: randomUUID(),
      investigationId: input.investigationId,
      normalizedUrl,
      normalizedUrlHash: normalizedUrlHashValue,
      status: "pending",
      reservedBy: null,
      reservedAt: null,
      processedAt: null,
      discoveredFrom: input.discoveredFrom ?? null,
      createdAt: now,
      updatedAt: now,
    }));

    const result = await this.database
      .insert(investigationUrlQueueTable)
      .values(values)
      .onConflictDoNothing({
        target: [
          investigationUrlQueueTable.investigationId,
          investigationUrlQueueTable.normalizedUrlHash,
        ],
      })
      .returning({ id: investigationUrlQueueTable.id });

    return {
      inserted: result.length,
      deduped: values.length - result.length,
    };
  }

  async reserveNext(input: {
    investigationId: string;
    workerId: string;
    prioritizeDiversity?: boolean;
  }): Promise<ReservedInvestigationUrl | null> {
    const normalizedInvestigationId = input.investigationId.trim();
    const normalizedWorkerId = input.workerId.trim();

    if (normalizedInvestigationId.length === 0 || normalizedWorkerId.length === 0) {
      return null;
    }

    return this.database.transaction(async (tx) => {
      const candidates = await tx
        .select({
          id: investigationUrlQueueTable.id,
          normalizedUrl: investigationUrlQueueTable.normalizedUrl,
          createdAt: investigationUrlQueueTable.createdAt,
          discoveredFrom: investigationUrlQueueTable.discoveredFrom,
        })
        .from(investigationUrlQueueTable)
        .where(
          and(
            eq(investigationUrlQueueTable.investigationId, normalizedInvestigationId),
            eq(investigationUrlQueueTable.status, "pending"),
          ),
        )
        .orderBy(asc(investigationUrlQueueTable.createdAt))
        .limit(input.prioritizeDiversity ? 8 : 1)
        .for("update", { skipLocked: true });

      const selected = input.prioritizeDiversity ? rankQueueCandidates(candidates)[0] : candidates[0];

      if (!selected) {
        return null;
      }

      const reservedAt = new Date().toISOString();

      const updated = await tx
        .update(investigationUrlQueueTable)
        .set({
          status: "reserved",
          reservedBy: normalizedWorkerId,
          reservedAt,
          updatedAt: reservedAt,
        })
        .where(eq(investigationUrlQueueTable.id, selected.id))
        .returning({
          id: investigationUrlQueueTable.id,
          investigationId: investigationUrlQueueTable.investigationId,
          normalizedUrl: investigationUrlQueueTable.normalizedUrl,
          reservedBy: investigationUrlQueueTable.reservedBy,
          reservedAt: investigationUrlQueueTable.reservedAt,
        });

      const queueItem = updated[0];

      if (!queueItem || !queueItem.reservedBy || !queueItem.reservedAt) {
        return null;
      }

      return {
        id: queueItem.id,
        investigationId: queueItem.investigationId,
        normalizedUrl: queueItem.normalizedUrl,
        reservedBy: queueItem.reservedBy,
        reservedAt: queueItem.reservedAt,
      };
    });
  }

  async markProcessed(queueItemId: string, workerId: string): Promise<void> {
    const normalizedWorkerId = workerId.trim();

    if (normalizedWorkerId.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    await this.database
      .update(investigationUrlQueueTable)
      .set({
        status: "processed",
        updatedAt: now,
        processedAt: now,
      })
      .where(
        and(
          eq(investigationUrlQueueTable.id, queueItemId),
          eq(investigationUrlQueueTable.reservedBy, normalizedWorkerId),
          eq(investigationUrlQueueTable.status, "reserved"),
        ),
      );
  }

  async markFailed(queueItemId: string, workerId: string): Promise<void> {
    const normalizedWorkerId = workerId.trim();

    if (normalizedWorkerId.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    await this.database
      .update(investigationUrlQueueTable)
      .set({
        status: "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(investigationUrlQueueTable.id, queueItemId),
          eq(investigationUrlQueueTable.reservedBy, workerId),
          eq(investigationUrlQueueTable.status, "reserved"),
        ),
      );
  }
}
