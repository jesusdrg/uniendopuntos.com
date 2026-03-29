import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/investigations/infrastructure/persistence/postgres/schema";

export type InvestigationDatabase = PostgresJsDatabase<typeof schema>;

export function createPostgresDatabase(databaseUrl: string): InvestigationDatabase {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

  return drizzle(sql, { schema });
}
