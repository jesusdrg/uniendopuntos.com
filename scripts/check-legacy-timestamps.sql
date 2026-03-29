-- Preflight check before applying drizzle/0002_illegal_vivisector.sql cast to timestamptz.
-- Run this query in production/staging and ensure all invalid_count values are 0.

WITH investigation_created AS (
  SELECT COUNT(*) AS invalid_count
  FROM investigations
  WHERE created_at IS NOT NULL
    AND created_at::text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
),
investigation_updated AS (
  SELECT COUNT(*) AS invalid_count
  FROM investigations
  WHERE updated_at IS NOT NULL
    AND updated_at::text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
),
finding_created AS (
  SELECT COUNT(*) AS invalid_count
  FROM findings
  WHERE created_at IS NOT NULL
    AND created_at::text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
),
blocked_blocked AS (
  SELECT COUNT(*) AS invalid_count
  FROM blocked_sources
  WHERE blocked_at IS NOT NULL
    AND blocked_at::text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
)
SELECT 'investigations.created_at' AS column_name, invalid_count FROM investigation_created
UNION ALL
SELECT 'investigations.updated_at' AS column_name, invalid_count FROM investigation_updated
UNION ALL
SELECT 'findings.created_at' AS column_name, invalid_count FROM finding_created
UNION ALL
SELECT 'blocked_sources.blocked_at' AS column_name, invalid_count FROM blocked_blocked;
