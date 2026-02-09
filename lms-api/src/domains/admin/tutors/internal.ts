import crypto from 'node:crypto';
import { hashToken, normalizeEmail } from '../../../lib/security.js';
import type { DbClient } from '../shared/types.js';

export function normalizeTutorEmail(email: string) {
  return normalizeEmail(email);
}

export async function createImpersonationSession(
  client: DbClient,
  data: {
    adminId: string;
    tutorId: string;
    tutorUserId: string;
    sessionToken: string;
    expiresAt: Date;
  }
) {
  const impersonationId = crypto.randomUUID();
  const sessionHash = hashToken(data.sessionToken);

  await client.query(
    `insert into impersonation_sessions
     (id, admin_user_id, tutor_id, tutor_user_id, session_hash, mode, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
    [
      impersonationId,
      data.adminId,
      data.tutorId,
      data.tutorUserId,
      sessionHash,
      'READ_ONLY',
      data.expiresAt.toISOString()
    ]
  );

  return { impersonationId, sessionHash };
}
