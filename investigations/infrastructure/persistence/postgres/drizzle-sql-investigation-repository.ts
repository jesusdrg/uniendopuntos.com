import { desc, eq, inArray } from "drizzle-orm";

import type {
  BlockedSource,
  FindingCard,
  Investigation,
} from "@/investigations/domain/entities/investigation";
import { BLOCKED_SOURCE_REASON_CATEGORIES } from "@/investigations/domain/entities/investigation";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";
import type { InvestigationDatabase } from "@/investigations/infrastructure/persistence/postgres/postgres-client";
import {
  blockedSourcesTable,
  findingsTable,
  investigationsTable,
} from "@/investigations/infrastructure/persistence/postgres/schema";

const LEGACY_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export class DrizzleSqlInvestigationRepository implements InvestigationRepository {
  constructor(private readonly database: InvestigationDatabase) {}

  async save(investigation: Investigation): Promise<void> {
    const investigationRow = this.toRow(investigation);

    await this.database.transaction(async (tx) => {
      await tx
        .insert(investigationsTable)
        .values(investigationRow)
        .onConflictDoUpdate({
          target: investigationsTable.id,
          set: investigationRow,
        });

      await tx.delete(findingsTable).where(eq(findingsTable.investigationId, investigation.id));

      if (investigation.findings.length > 0) {
        await tx.insert(findingsTable).values(
          investigation.findings.map((finding) => ({
            id: finding.id,
            investigationId: investigation.id,
            title: finding.title,
            sourceUrl: finding.sourceUrl,
            summary: finding.summary,
            createdAt: finding.createdAt,
          })),
        );
      }

      await tx.delete(blockedSourcesTable).where(eq(blockedSourcesTable.investigationId, investigation.id));

      if (investigation.blockedSources.length > 0) {
        await tx.insert(blockedSourcesTable).values(
          investigation.blockedSources.map((blockedSource) => ({
            id: blockedSource.id,
            investigationId: investigation.id,
            url: blockedSource.url,
            reasonCategory: blockedSource.reasonCategory,
            note: blockedSource.note,
            blockedAt: blockedSource.blockedAt,
          })),
        );
      }
    });
  }

  async findById(id: string): Promise<Investigation | null> {
    const investigationRows = await this.database
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, id))
      .limit(1);

    if (investigationRows.length === 0) {
      return null;
    }

    const findingsRows = await this.database
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.investigationId, id))
      .orderBy(desc(findingsTable.createdAt));

    const blockedSourcesRows = await this.database
      .select()
      .from(blockedSourcesTable)
      .where(eq(blockedSourcesTable.investigationId, id))
      .orderBy(desc(blockedSourcesTable.blockedAt));

    return this.toEntity(investigationRows[0], findingsRows, blockedSourcesRows);
  }

  async list(): Promise<Investigation[]> {
    const investigationRows = await this.database
      .select()
      .from(investigationsTable)
      .orderBy(desc(investigationsTable.createdAt));

    if (investigationRows.length === 0) {
      return [];
    }

    const investigationIds = investigationRows.map((row) => row.id);

    const findingsRows = await this.database
      .select()
      .from(findingsTable)
      .where(inArray(findingsTable.investigationId, investigationIds))
      .orderBy(desc(findingsTable.createdAt));

    const blockedSourcesRows = await this.database
      .select()
      .from(blockedSourcesTable)
      .where(inArray(blockedSourcesTable.investigationId, investigationIds))
      .orderBy(desc(blockedSourcesTable.blockedAt));

    const findingsByInvestigationId = new Map<string, FindingCard[]>();

    for (const findingRow of findingsRows) {
      const list = findingsByInvestigationId.get(findingRow.investigationId) ?? [];
      list.push({
        id: findingRow.id,
        title: findingRow.title,
        sourceUrl: findingRow.sourceUrl,
        summary: findingRow.summary,
        createdAt: findingRow.createdAt,
      });
      findingsByInvestigationId.set(findingRow.investigationId, list);
    }

    const blockedSourcesByInvestigationId = new Map<string, BlockedSource[]>();

    for (const blockedSourceRow of blockedSourcesRows) {
      const list = blockedSourcesByInvestigationId.get(blockedSourceRow.investigationId) ?? [];
      list.push({
        id: blockedSourceRow.id,
        url: blockedSourceRow.url,
        reasonCategory: blockedSourceRow.reasonCategory as BlockedSource["reasonCategory"],
        note: blockedSourceRow.note ?? undefined,
        blockedAt: blockedSourceRow.blockedAt,
      });
      blockedSourcesByInvestigationId.set(blockedSourceRow.investigationId, list);
    }

    return investigationRows.map((row) =>
      this.toEntity(
        row,
        findingsByInvestigationId.get(row.id) ?? [],
        blockedSourcesByInvestigationId.get(row.id) ?? [],
      ),
    );
  }

  private toRow(investigation: Investigation) {
    return {
      id: investigation.id,
      query: investigation.query,
      status: investigation.status,
      createdAt: investigation.createdAt,
      updatedAt: investigation.updatedAt,
      findings: investigation.findings,
      blockedSources: investigation.blockedSources,
    };
  }

  private toEntity(
    row: typeof investigationsTable.$inferSelect,
    findingsRows:
      | FindingCard[]
      | (typeof findingsTable.$inferSelect)[]
      | undefined,
    blockedSourcesRows:
      | BlockedSource[]
      | (typeof blockedSourcesTable.$inferSelect)[]
      | undefined,
  ): Investigation {
    const findings = this.parseFindings(row.findings, findingsRows);
    const blockedSources = this.parseBlockedSources(row.blockedSources, blockedSourcesRows);

    return {
      id: row.id,
      query: row.query,
      status: row.status as Investigation["status"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      findings,
      blockedSources,
    };
  }

  private parseFindings(
    legacyFindings: unknown,
    findingsRows: FindingCard[] | (typeof findingsTable.$inferSelect)[] | undefined,
  ): FindingCard[] {
    if (Array.isArray(findingsRows) && findingsRows.length > 0) {
      const firstRow = findingsRows[0];

      if ("investigationId" in firstRow) {
        return (findingsRows as (typeof findingsTable.$inferSelect)[]).map((findingRow) => ({
          id: findingRow.id,
          title: findingRow.title,
          sourceUrl: findingRow.sourceUrl,
          summary: findingRow.summary,
          createdAt: findingRow.createdAt,
        }));
      }

      return findingsRows as FindingCard[];
    }

    if (!Array.isArray(legacyFindings)) {
      return [];
    }

    return legacyFindings
      .map((finding): FindingCard | null => {
        if (!finding || typeof finding !== "object") {
          return null;
        }

        const row = finding as {
          id?: unknown;
          title?: unknown;
          sourceUrl?: unknown;
          url?: unknown;
          summary?: unknown;
          createdAt?: unknown;
        };

        const sourceUrl = typeof row.sourceUrl === "string" ? row.sourceUrl : row.url;

        if (
          typeof row.id !== "string" ||
          typeof row.title !== "string" ||
          typeof sourceUrl !== "string" ||
          typeof row.summary !== "string" ||
          typeof row.createdAt !== "string" ||
          !this.isValidLegacyTimestamp(row.createdAt)
        ) {
          return null;
        }

        return {
          id: row.id,
          title: row.title,
          sourceUrl,
          summary: row.summary,
          createdAt: row.createdAt,
        };
      })
      .filter((finding): finding is FindingCard => finding !== null);
  }

  private parseBlockedSources(
    legacyBlockedSources: unknown,
    blockedSourcesRows: BlockedSource[] | (typeof blockedSourcesTable.$inferSelect)[] | undefined,
  ): BlockedSource[] {
    if (Array.isArray(blockedSourcesRows) && blockedSourcesRows.length > 0) {
      const firstRow = blockedSourcesRows[0];

      if ("investigationId" in firstRow) {
        return (blockedSourcesRows as (typeof blockedSourcesTable.$inferSelect)[]).map(
          (blockedSourceRow) => ({
            id: blockedSourceRow.id,
            url: blockedSourceRow.url,
            reasonCategory: blockedSourceRow.reasonCategory as BlockedSource["reasonCategory"],
            note: blockedSourceRow.note ?? undefined,
            blockedAt: blockedSourceRow.blockedAt,
          }),
        );
      }

      return blockedSourcesRows as BlockedSource[];
    }

    if (!Array.isArray(legacyBlockedSources)) {
      return [];
    }

    return legacyBlockedSources
      .map((blockedSource): BlockedSource | null => {
        if (!blockedSource || typeof blockedSource !== "object") {
          return null;
        }

        const row = blockedSource as {
          id?: unknown;
          url?: unknown;
          reasonCategory?: unknown;
          reason?: unknown;
          note?: unknown;
          blockedAt?: unknown;
        };

        const reasonCategory =
          typeof row.reasonCategory === "string"
            ? row.reasonCategory
            : typeof row.reason === "string"
              ? "other"
              : undefined;

        const isValidReasonCategory =
          typeof reasonCategory === "string" &&
          BLOCKED_SOURCE_REASON_CATEGORIES.includes(
            reasonCategory as BlockedSource["reasonCategory"],
          );

        if (
          typeof row.id !== "string" ||
          typeof row.url !== "string" ||
          !isValidReasonCategory ||
          typeof row.blockedAt !== "string" ||
          !this.isValidLegacyTimestamp(row.blockedAt)
        ) {
          return null;
        }

        return {
          id: row.id,
          url: row.url,
          reasonCategory: reasonCategory as BlockedSource["reasonCategory"],
          note: typeof row.note === "string" ? row.note : undefined,
          blockedAt: row.blockedAt,
        };
      })
      .filter((blockedSource): blockedSource is BlockedSource => blockedSource !== null);
  }

  private isValidLegacyTimestamp(value: string): boolean {
    if (!LEGACY_TIMESTAMP_PATTERN.test(value)) {
      return false;
    }

    return !Number.isNaN(Date.parse(value));
  }
}
