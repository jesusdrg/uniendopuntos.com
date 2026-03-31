import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const investigationsTable = pgTable("investigations", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  findings: jsonb("findings").notNull(),
  findingConnections: jsonb("finding_connections").notNull(),
  blockedSources: jsonb("blocked_sources").notNull(),
});

export const findingsTable = pgTable("findings", {
  id: text("id").primaryKey(),
  investigationId: text("investigation_id")
    .notNull()
    .references(() => investigationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull(),
  summary: text("summary").notNull(),
  relatedFindingIds: jsonb("related_finding_ids").notNull(),
  sharedEntityKeys: jsonb("shared_entity_keys").notNull(),
  claimHashes: jsonb("claim_hashes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const blockedSourcesTable = pgTable(
  "blocked_sources",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigationsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    reasonCategory: text("reason_category").notNull(),
    note: text("note"),
    blockedAt: timestamp("blocked_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("blocked_sources_investigation_url_reason_unique").on(
      table.investigationId,
      table.url,
      table.reasonCategory,
    ),
  ],
);

export const investigationUrlQueueTable = pgTable(
  "investigation_url_queue",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigationsTable.id, { onDelete: "cascade" }),
    normalizedUrl: text("normalized_url").notNull(),
    normalizedUrlHash: text("normalized_url_hash").notNull(),
    status: text("status").notNull(),
    reservedBy: text("reserved_by"),
    reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "string" }),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
    discoveredFrom: text("discovered_from"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("investigation_url_queue_investigation_url_hash_unique").on(
      table.investigationId,
      table.normalizedUrlHash,
    ),
  ],
);
