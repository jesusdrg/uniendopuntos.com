import { describe, expect, it } from "bun:test";

import { DrizzleSqlInvestigationUrlQueueRepository } from "@/investigations/infrastructure/persistence/postgres/drizzle-sql-investigation-url-queue-repository";
import { normalizeUrl } from "@/investigations/infrastructure/persistence/url-normalizer";

type RecordedCall = {
  kind: string;
  args: unknown[];
};

function createFakeDb(returningRows: Array<{ id: string }> = [{ id: "inserted-1" }]) {
  const calls: RecordedCall[] = [];

  const database = {
    insert(table: unknown) {
      void table;
      return {
        values(values: unknown[]) {
          calls.push({ kind: "insert.values", args: values });
          return {
            onConflictDoNothing(input: unknown) {
              void input;
              return {
                async returning() {
                  return returningRows;
                },
              };
            },
          };
        },
      };
    },
    async transaction<T>(handler: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    orderBy() {
                      return {
                        limit() {
                          return {
                             for() {
                               return [
                                 {
                                   id: "queue-1",
                                   normalizedUrl: "https://example.com/a",
                                   createdAt: "2026-03-30T12:00:00.000Z",
                                   discoveredFrom: null,
                                 },
                               ];
                             },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            set(payload: unknown) {
              void payload;
              return {
                where() {
                  return {
                    async returning() {
                      return [
                        {
                          id: "queue-1",
                          investigationId: "inv",
                          normalizedUrl: "https://example.com/a",
                          reservedBy: "researcher-1",
                          reservedAt: new Date().toISOString(),
                        },
                      ];
                    },
                  };
                },
              };
            },
          };
        },
      };

      return handler(tx);
    },
    update() {
      return {
        set() {
          return {
            async where() {},
          };
        },
      };
    },
  };

  return {
    database,
    calls,
  };
}

describe("DrizzleSqlInvestigationUrlQueueRepository", () => {
  it("dedupes urls on enqueueMany", async () => {
    const fake = createFakeDb([{ id: "inserted-1" }]);
    const repository = new DrizzleSqlInvestigationUrlQueueRepository(fake.database as never);

    const result = await repository.enqueueMany({
      investigationId: "inv",
      urls: [
        "https://EXAMPLE.com/a?b=2&a=1",
        "https://example.com/a?a=1&b=2",
        "https://example.com/b",
      ],
    });

    expect(result.inserted).toBe(1);
    expect(result.deduped).toBe(1);
    expect(fake.calls).toHaveLength(1);
  });

  it("handles very long urls using normalized url hash dedupe", async () => {
    const fake = createFakeDb([{ id: "inserted-1" }]);
    const repository = new DrizzleSqlInvestigationUrlQueueRepository(fake.database as never);

    const longPathSegment = "a".repeat(5000);
    const longUrlA = `https://example.com/${longPathSegment}?z=9&a=1`;
    const longUrlB = `https://EXAMPLE.com/${longPathSegment}?a=1&z=9#fragment`;

    const result = await repository.enqueueMany({
      investigationId: "inv",
      urls: [longUrlA, longUrlB],
    });

    const insertedValues = fake.calls.at(0)?.args as
      | Array<{ normalizedUrl: string; normalizedUrlHash: string }>
      | undefined;
    const firstInsert = insertedValues?.at(0);

    expect(result.inserted).toBe(1);
    expect(result.deduped).toBe(0);
    expect(firstInsert?.normalizedUrl).toBe(normalizeUrl(longUrlA));
    expect(firstInsert?.normalizedUrlHash).toBeString();
    expect(firstInsert?.normalizedUrlHash.length).toBe(64);
  });

  it("dedupes conflicting hash values within a single enqueue batch", async () => {
    const fake = createFakeDb([{ id: "inserted-1" }]);
    const repository = new DrizzleSqlInvestigationUrlQueueRepository(
      fake.database as never,
      () => "forced-conflict-hash",
    );

    const result = await repository.enqueueMany({
      investigationId: "inv",
      urls: ["https://example.com/a", "https://example.com/b"],
    });

    const insertedValues = fake.calls.at(0)?.args as
      | Array<{ normalizedUrl: string; normalizedUrlHash: string }>
      | undefined;

    expect(result.inserted).toBe(1);
    expect(result.deduped).toBe(0);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues?.at(0)?.normalizedUrlHash).toBe("forced-conflict-hash");
  });

  it("reserves next pending item atomically", async () => {
    const fake = createFakeDb();
    const repository = new DrizzleSqlInvestigationUrlQueueRepository(fake.database as never);

    const reserved = await repository.reserveNext({
      investigationId: "inv",
      workerId: "researcher-1",
      prioritizeDiversity: true,
    });

    expect(reserved?.id).toBe("queue-1");
    expect(reserved?.reservedBy).toBe("researcher-1");
  });
});
