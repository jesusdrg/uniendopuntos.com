import { describe, expect, it } from "bun:test";

import {
  blockedSourcesTable,
  findingsTable,
  investigationUrlQueueTable,
  investigationsTable,
} from "@/investigations/infrastructure/persistence/postgres/schema";

describe("Postgres schema timestamp hardening", () => {
  it("uses timestamptz for persistence timestamps", () => {
    expect((investigationsTable.createdAt as { getSQLType: () => string }).getSQLType()).toBe(
      "timestamp with time zone",
    );
    expect((investigationsTable.updatedAt as { getSQLType: () => string }).getSQLType()).toBe(
      "timestamp with time zone",
    );
    expect((findingsTable.createdAt as { getSQLType: () => string }).getSQLType()).toBe(
      "timestamp with time zone",
    );
    expect((blockedSourcesTable.blockedAt as { getSQLType: () => string }).getSQLType()).toBe(
      "timestamp with time zone",
    );
    expect(
      (investigationUrlQueueTable.normalizedUrlHash as { getSQLType: () => string }).getSQLType(),
    ).toBe("text");
  });
});
