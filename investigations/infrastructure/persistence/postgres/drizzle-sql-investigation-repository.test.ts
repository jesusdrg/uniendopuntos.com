import { describe, expect, it } from "bun:test";

import type { Investigation } from "@/investigations/domain/entities/investigation";
import { DrizzleSqlInvestigationRepository } from "@/investigations/infrastructure/persistence/postgres/drizzle-sql-investigation-repository";

type Predicate = unknown;

type FakeDb = {
  transaction: (callback: (tx: FakeTransaction) => Promise<void>) => Promise<void>;
  insert: (table: unknown) => {
    values: (payload: unknown) => {
      onConflictDoUpdate: (input: unknown) => Promise<void>;
    };
  };
  delete: (table: unknown) => {
    where: (predicate: Predicate) => Promise<void>;
  };
};

type FakeTransaction = Omit<FakeDb, "transaction">;

function createFakeDatabase(): { database: FakeDb; calls: string[]; txCalls: string[] } {
  const calls: string[] = [];
  const txCalls: string[] = [];

  const tx: FakeTransaction = {
    insert(_table: unknown) {
      txCalls.push("insert");

      return {
        values(_payload: unknown) {
          txCalls.push("values");

          return {
            async onConflictDoUpdate(_input: unknown): Promise<void> {
              txCalls.push("onConflictDoUpdate");
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      txCalls.push("delete");

      return {
        async where(_predicate: Predicate): Promise<void> {
          txCalls.push("where");
        },
      };
    },
  };

  const database: FakeDb = {
    async transaction(callback) {
      calls.push("transaction");
      await callback(tx);
    },
    insert(_table: unknown) {
      calls.push("insert-outside-transaction");

      return {
        values(_payload: unknown) {
          calls.push("values-outside-transaction");

          return {
            async onConflictDoUpdate(_input: unknown): Promise<void> {
              calls.push("onConflictDoUpdate-outside-transaction");
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      calls.push("delete-outside-transaction");

      return {
        async where(_predicate: Predicate): Promise<void> {
          calls.push("where-outside-transaction");
        },
      };
    },
  };

  return {
    database,
    calls,
    txCalls,
  };
}

describe("DrizzleSqlInvestigationRepository save hardening", () => {
  it("uses a database transaction for multi-table save", async () => {
    const fake = createFakeDatabase();
    const repository = new DrizzleSqlInvestigationRepository(fake.database as never);
    const now = new Date().toISOString();

    const investigation: Investigation = {
      id: "inv-1",
      query: "Tema",
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [
        {
          id: "finding-1",
          title: "Hallazgo",
          sourceUrl: "https://example.com/f",
          summary: "Resumen",
          createdAt: now,
        },
      ],
      blockedSources: [
        {
          id: "blocked-1",
          url: "https://example.com/b",
          reasonCategory: "paywall",
          note: "No accesible",
          blockedAt: now,
        },
      ],
    };

    await repository.save(investigation);

    expect(fake.calls).toEqual(["transaction"]);
    expect(fake.txCalls).toContain("onConflictDoUpdate");
    expect(fake.txCalls.filter((entry) => entry === "delete")).toHaveLength(2);
    expect(fake.txCalls.filter((entry) => entry === "insert").length).toBeGreaterThanOrEqual(3);
  });
});
