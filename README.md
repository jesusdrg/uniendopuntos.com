This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Investigations SSE (Slice 4)

- SSE stream endpoint by investigation: `GET /api/investigations/[id]/events`
- Event types emitted on mutations:
  - `investigation.created`
  - `investigation.finding_added`
  - `investigation.blocked_source_registered`
- Keepalive is sent periodically as SSE comments (`: keepalive`).

### SSE payload compatibility and deprecation (Slice 7)

- Current default mode keeps backward-compatible duplicate keys (legacy + v2 envelope).
- Strict v2 mode is available right now for opt-in consumers:
  - Query param: `?payloadMode=strict-v2`
  - Header: `x-sse-payload-mode: strict-v2`
- Deprecation policy:
  - Legacy duplicate payload keys will be removed when all first-party consumers are migrated to strict v2.
  - Target removal date: `2026-06-30` or after two consecutive releases with no legacy usage in logs, whichever happens later.
  - Retirement criteria: no clients depending on top-level duplicated keys (`type`, `investigationId`, `payload`, etc.).

### Observability MVP (Slice 7)

- Request correlation: all API and SSE routes return `x-request-id`.
  - If incoming `x-request-id` exists, it is preserved.
  - Otherwise a UUID is generated server-side.
- Structured JSON logs for API and SSE include base fields:
  - `timestamp`, `level`, `requestId`, `route`, `methodEvent`, `statusResult`, `durationMs`, `errorCode` (when present).
- API metrics endpoint (in-memory MVP): `GET /api/investigations/metrics`
  - Includes counters and latency basics per key endpoint.
  - Includes global SSE pressure control snapshot.

Latency metric (MVP, in-memory):

- Endpoint: `GET /api/investigations/events/metrics`
- Metric: `investigation_sse_publish_latency_ms`
- Measures from successful persistence timestamp to:
  - broker emission timestamp, and
  - delivery timestamp for each connected SSE subscriber.
- Aggregates: `count`, `p50`, `p95`, `p99`, `max`.
- Also includes stream metrics and global control state (subscriber limit, rejects, drops).

### Timestamp migration safety pre-check

- Before applying timestamptz cast migration `drizzle/0002_illegal_vivisector.sql`, run:
  - `scripts/check-legacy-timestamps.sql`
- Checklist:
  1. Execute the script on target environment.
   2. Confirm every `invalid_count` is `0`.
   3. Only then run the migration.

## Integration tests (Postgres real)

- Script: `bun run test:integration`
- Default safe fallback: if `DATABASE_URL` is not set, tests use `postgresql://postgres:postgres@localhost:5432/uniendopuntos`.
- Safety gate: remote hosts are blocked by default to avoid accidental writes on shared/prod databases.

Local run examples:

```bash
# 1) Using local default fallback
bun run test:integration

# 2) Explicit local DATABASE_URL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uniendopuntos bun run test:integration

# 3) Remote database (only if intentionally needed)
ALLOW_INTEGRATION_REMOTE_DB=true DATABASE_URL=postgresql://user:pass@host:5432/db bun run test:integration
```

What is covered by integration:

- Transaction rollback behavior on multi-table writes against real Postgres.
- Critical API flow persisted on Postgres:
  - `POST /api/investigations`
  - `POST /api/investigations/[id]/findings`
  - `GET /api/investigations/[id]`

Manual test with curl:

```bash
# 1) Start SSE subscription in terminal A
curl -N http://localhost:3000/api/investigations/<investigation-id>/events

# 2) Trigger finding event in terminal B
curl -X POST http://localhost:3000/api/investigations/<investigation-id>/findings \
  -H "content-type: application/json" \
  -d '{"title":"Documento","summary":"Resumen","sourceUrl":"https://example.com"}'

# 3) Check latency metrics
curl http://localhost:3000/api/investigations/events/metrics
```
