import { Pool } from 'pg';

type Issue = {
  severity: 'warning' | 'critical';
  category: string;
  message: string;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback = false) {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;
  if (!databaseUrl) {
    console.error('DATABASE_URL or DATABASE_URL_TEST is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const issues: Issue[] = [];

  const deadTupleWarn = envNumber('DB_MAINTENANCE_DEAD_TUP_WARN', 10000);
  const seqScanWarn = envNumber('DB_MAINTENANCE_SEQ_SCAN_WARN', 1000);
  const idxScanMin = envNumber('DB_MAINTENANCE_IDX_SCAN_MIN', 10);
  const slowQueryWarnMs = envNumber('DB_MAINTENANCE_SLOW_QUERY_WARN_MS', 250);
  const slowQueryCriticalMs = envNumber('DB_MAINTENANCE_SLOW_QUERY_CRITICAL_MS', 750);
  const strictMode = envBool('DB_MAINTENANCE_STRICT', false);

  try {
    const deadTupleRes = await pool.query(
      `select relname, n_dead_tup, n_live_tup
       from pg_stat_user_tables
       where n_dead_tup > $1
       order by n_dead_tup desc
       limit 20`,
      [deadTupleWarn]
    );

    for (const row of deadTupleRes.rows) {
      issues.push({
        severity: 'warning',
        category: 'bloat',
        message: `High dead tuples: ${row.relname} dead=${row.n_dead_tup} live=${row.n_live_tup}`,
      });
    }

    const lowIndexUsageRes = await pool.query(
      `select schemaname, relname, seq_scan, idx_scan
       from pg_stat_user_tables
       where seq_scan > $1 and coalesce(idx_scan, 0) < $2
       order by seq_scan desc
       limit 20`,
      [seqScanWarn, idxScanMin]
    );

    for (const row of lowIndexUsageRes.rows) {
      issues.push({
        severity: 'warning',
        category: 'index_usage',
        message: `Potential missing index: ${row.schemaname}.${row.relname} seq_scan=${row.seq_scan} idx_scan=${row.idx_scan}`,
      });
    }

    // Best-effort enablement when permissions allow. This avoids false alarms in local environments.
    try {
      await pool.query('create extension if not exists pg_stat_statements');
    } catch {
      // Ignore and continue with detection below.
    }

    const statStatementsRes = await pool.query(
      `select exists (
         select 1
         from pg_extension
         where extname = 'pg_stat_statements'
       ) as installed`
    );

    const hasStatStatements = Boolean(statStatementsRes.rows[0]?.installed);
    if (hasStatStatements) {
      const slowQueryRes = await pool.query(
        `select query,
                calls,
                round((total_exec_time / greatest(calls, 1))::numeric, 2) as avg_ms
         from pg_stat_statements
         where calls >= 10
         order by (total_exec_time / greatest(calls, 1)) desc
         limit 10`
      );

      for (const row of slowQueryRes.rows) {
        const avgMs = Number(row.avg_ms || 0);
        if (avgMs >= slowQueryWarnMs) {
          issues.push({
            severity: avgMs >= slowQueryCriticalMs ? 'critical' : 'warning',
            category: 'slow_query',
            message: `Slow query avg=${avgMs}ms calls=${row.calls} sql=${String(row.query).replace(/\s+/g, ' ').trim().slice(0, 140)}`,
          });
        }
      }
    } else {
      issues.push({
        severity: 'warning',
        category: 'observability',
        message: 'pg_stat_statements extension is not installed; slow query monitoring is limited.',
      });
    }

    console.log(`db_maintenance_checks_completed issues=${issues.length}`);
    console.log(`db_maintenance_config strict=${strictMode} dead_warn=${deadTupleWarn} seq_warn=${seqScanWarn} idx_min=${idxScanMin} slow_warn_ms=${slowQueryWarnMs} slow_critical_ms=${slowQueryCriticalMs}`);
    for (const issue of issues) {
      const prefix = issue.severity === 'critical' ? 'CRITICAL' : 'WARN';
      console.log(`${prefix} [${issue.category}] ${issue.message}`);
    }

    const hasCritical = issues.some((issue) => issue.severity === 'critical');
    const hasWarning = issues.some((issue) => issue.severity === 'warning');
    if (hasCritical) {
      process.exit(2);
    }
    if (strictMode && hasWarning) {
      process.exit(3);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('db_maintenance_checks_failed', error);
  process.exit(1);
});
