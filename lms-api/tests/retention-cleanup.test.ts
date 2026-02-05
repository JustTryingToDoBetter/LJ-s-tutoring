import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { runRetentionCleanup } from '../src/lib/retention-cleanup.js';

describe('Retention cleanup', () => {
  beforeEach(async () => {
    await resetDb();
    process.env.RETENTION_MAGIC_LINK_DAYS = '0';
    process.env.RETENTION_AUDIT_YEARS = '0';
    process.env.RETENTION_PRIVACY_REQUESTS_YEARS = '0';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deletes expired magic link tokens and old audit logs', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const userRes = await pool.query(
      `insert into users (email, role)
       values ($1, 'ADMIN') returning id`,
      ['retention-admin@example.com']
    );
    const userId = userRes.rows[0].id as string;

    await pool.query(
      `insert into magic_link_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [userId, 'old-token', oldDate.toISOString()]
    );

    await pool.query(
      `insert into audit_log (actor_user_id, actor_role, action, created_at)
       values ($1, 'ADMIN', 'test', $2)`,
      [userId, oldDate.toISOString()]
    );

    await pool.query(
      `insert into privacy_requests (request_type, subject_type, subject_id, reason, status, created_by_user_id, created_at)
       values ('ACCESS', 'TUTOR', $1, 'old request', 'OPEN', $2, $3)`,
      [userId, userId, oldDate.toISOString()]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await runRetentionCleanup(client, new Date());
      await client.query('COMMIT');
      expect(result.summary.magicLinkTokensDeleted).toBe(1);
      expect(result.summary.auditLogsDeleted).toBe(1);
      expect(result.summary.privacyRequestsDeleted).toBe(1);
    } finally {
      client.release();
    }
  });
});
