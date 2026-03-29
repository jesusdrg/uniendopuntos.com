import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const investigationsTable = pgTable("investigations", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  findings: jsonb("findings").notNull(),
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
