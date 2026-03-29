import { spawn } from "node:child_process";

const DEFAULT_INTEGRATION_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/uniendopuntos";
const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

function resolveDatabaseUrl(): string {
  const candidate = process.env.DATABASE_URL?.trim();
  return candidate && candidate.length > 0 ? candidate : DEFAULT_INTEGRATION_DATABASE_URL;
}

function assertSafeDatabaseUrl(databaseUrl: string): void {
  const allowRemote = process.env.ALLOW_INTEGRATION_REMOTE_DB === "true";
  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL debe usar protocolo postgres:// o postgresql://");
  }

  if (!allowRemote && !SAFE_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Host '${parsed.hostname}' bloqueado para integracion. Usa ALLOW_INTEGRATION_REMOTE_DB=true para habilitarlo.`,
    );
  }
}

async function run(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  assertSafeDatabaseUrl(databaseUrl);

  const child = spawn(
    process.execPath,
    ["test", "./tests/integration/postgres.persistence.integration.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
      },
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });

  process.exit(exitCode);
}

void run();
