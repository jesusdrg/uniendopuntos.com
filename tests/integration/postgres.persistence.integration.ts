import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";

import { DrizzleSqlInvestigationRepository } from "@/investigations/infrastructure/persistence/postgres/drizzle-sql-investigation-repository";
import { createPostgresDatabase } from "@/investigations/infrastructure/persistence/postgres/postgres-client";
import {
  blockedSourcesTable,
  findingsTable,
  investigationsTable,
} from "@/investigations/infrastructure/persistence/postgres/schema";

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/uniendopuntos";
const databaseUrl = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;

process.env.DATABASE_URL = databaseUrl;

const database = createPostgresDatabase(databaseUrl);
const repository = new DrizzleSqlInvestigationRepository(database);

let createInvestigationRoute: typeof import("@/app/api/investigations/route").POST;
let addFindingRoute: typeof import("@/app/api/investigations/[id]/findings/route").POST;
let getInvestigationByIdRoute: typeof import("@/app/api/investigations/[id]/route").GET;
let startInvestigationRoute: typeof import("@/app/api/investigations/[id]/start/route").POST;

describe("Postgres integration", () => {
  beforeAll(async () => {
    await ensureSchema();

    const investigationsRouteModule = await import("@/app/api/investigations/route");
    createInvestigationRoute = investigationsRouteModule.POST;

    const findingsRouteModule = await import("@/app/api/investigations/[id]/findings/route");
    addFindingRoute = findingsRouteModule.POST;

    const investigationByIdRouteModule = await import("@/app/api/investigations/[id]/route");
    getInvestigationByIdRoute = investigationByIdRouteModule.GET;

    const startRouteModule = await import("@/app/api/investigations/[id]/start/route");
    startInvestigationRoute = startRouteModule.POST;
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it("rolls back multi-table save when a nested write fails", async () => {
    const transientInvestigationId = randomUUID();
    const timestamp = new Date().toISOString();

    await expect(
      database.transaction(async (tx) => {
        await tx.insert(investigationsTable).values({
          id: transientInvestigationId,
          query: "investigacion transaccional",
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
          findings: [],
          findingConnections: [],
          blockedSources: [],
        });

        await tx.insert(findingsTable).values({
          id: randomUUID(),
          investigationId: transientInvestigationId,
          title: "hallazgo transitorio",
          sourceUrl: "https://example.com/transient",
          summary: "debe revertirse",
          relatedFindingIds: [],
          sharedEntityKeys: [],
          claimHashes: [],
          createdAt: timestamp,
        });

        await tx.insert(blockedSourcesTable).values({
          id: randomUUID(),
          investigationId: transientInvestigationId,
          url: "https://example.com/blocked",
          reasonCategory: "other",
          note: "debe revertirse",
          blockedAt: timestamp,
        });

        throw new Error("rollback intencional para test de integracion");
      }),
    ).rejects.toThrow();

    const persistedInvestigation = await repository.findById(transientInvestigationId);
    expect(persistedInvestigation).toBeNull();
  });

  it("persists critical endpoint flow using postgres", async () => {
    const createResponse = await createInvestigationRoute(
      new Request("http://localhost/api/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "auditar endpoint critico" }),
      }),
    );

    expect(createResponse.status).toBe(201);

    const createPayload = (await createResponse.json()) as {
      id: string;
      query: string;
      findings: unknown[];
    };

    expect(createPayload.id.length).toBeGreaterThan(0);
    expect(createPayload.query).toBe("auditar endpoint critico");
    expect(createPayload.findings).toHaveLength(0);

    const addFindingResponse = await addFindingRoute(
      new Request(`http://localhost/api/investigations/${createPayload.id}/findings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "hallazgo de integracion",
          summary: "valida persistencia real sobre postgres",
          sourceUrl: "https://example.com/integration",
        }),
      }),
      {
        params: Promise.resolve({ id: createPayload.id }),
      },
    );

    expect(addFindingResponse.status).toBe(200);

    const addFindingPayload = (await addFindingResponse.json()) as {
      id: string;
      findings: Array<{ title: string }>;
    };

    expect(addFindingPayload.id).toBe(createPayload.id);
    expect(addFindingPayload.findings).toHaveLength(1);
    expect(addFindingPayload.findings[0]?.title).toBe("hallazgo de integracion");

    const getByIdResponse = await getInvestigationByIdRoute(
      new Request(`http://localhost/api/investigations/${createPayload.id}`, {
        method: "GET",
      }),
      {
        params: Promise.resolve({ id: createPayload.id }),
      },
    );

    expect(getByIdResponse.status).toBe(200);

    const getByIdPayload = (await getByIdResponse.json()) as {
      id: string;
      findings: Array<{ title: string; sourceUrl: string }>;
    };

    expect(getByIdPayload.id).toBe(createPayload.id);
    expect(getByIdPayload.findings).toHaveLength(1);
    expect(getByIdPayload.findings[0]?.title).toBe("hallazgo de integracion");
    expect(getByIdPayload.findings[0]?.sourceUrl).toBe("https://example.com/integration");
  });

  it("accepts start flow and processes queue-backed findings", async () => {
    const createResponse = await createInvestigationRoute(
      new Request("http://localhost/api/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "start flow integration" }),
      }),
    );

    const createPayload = (await createResponse.json()) as { id: string };

    const startResponse = await startInvestigationRoute(
      new Request(`http://localhost/api/investigations/${createPayload.id}/start`, {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: createPayload.id }),
      },
    );

    expect(startResponse.status).toBe(202);

    await Bun.sleep(250);

    const getByIdResponse = await getInvestigationByIdRoute(
      new Request(`http://localhost/api/investigations/${createPayload.id}`, {
        method: "GET",
      }),
      {
        params: Promise.resolve({ id: createPayload.id }),
      },
    );

    expect(getByIdResponse.status).toBe(200);

    const payload = (await getByIdResponse.json()) as {
      findings: unknown[];
    };

    expect(payload.findings.length).toBeGreaterThan(0);
  });
});

async function ensureSchema(): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS investigations (
      id text PRIMARY KEY NOT NULL,
      query text NOT NULL,
      status text NOT NULL,
      created_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone NOT NULL,
      findings jsonb NOT NULL,
      finding_connections jsonb NOT NULL DEFAULT '[]'::jsonb,
      blocked_sources jsonb NOT NULL
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS findings (
      id text PRIMARY KEY NOT NULL,
      investigation_id text NOT NULL REFERENCES investigations(id) ON DELETE cascade,
      title text NOT NULL,
      source_url text NOT NULL,
      summary text NOT NULL,
      related_finding_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      shared_entity_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
      claim_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp with time zone NOT NULL
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS blocked_sources (
      id text PRIMARY KEY NOT NULL,
      investigation_id text NOT NULL REFERENCES investigations(id) ON DELETE cascade,
      url text NOT NULL,
      reason_category text NOT NULL,
      note text,
      blocked_at timestamp with time zone NOT NULL
    );
  `);

  await database.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS blocked_sources_investigation_url_reason_unique
    ON blocked_sources (investigation_id, url, reason_category);
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS investigation_url_queue (
      id text PRIMARY KEY NOT NULL,
      investigation_id text NOT NULL REFERENCES investigations(id) ON DELETE cascade,
      normalized_url text NOT NULL,
      normalized_url_hash text NOT NULL,
      status text NOT NULL,
      reserved_by text,
      reserved_at timestamp with time zone,
      processed_at timestamp with time zone,
      discovered_from text,
      created_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone NOT NULL
    );
  `);

  await database.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS investigation_url_queue_investigation_url_hash_unique
    ON investigation_url_queue (investigation_id, normalized_url_hash);
  `);
}

async function resetDatabase(): Promise<void> {
  await database.execute(
    "TRUNCATE TABLE investigation_url_queue, blocked_sources, findings, investigations RESTART IDENTITY CASCADE;",
  );
}
