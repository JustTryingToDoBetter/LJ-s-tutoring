import type { Pool, PoolClient } from 'pg';
import type { writeAuditLog } from '../../../lib/audit.js';

export type DbClient = Pool | PoolClient;

export type AuditLogWriter = (
  client: DbClient,
  entry: Parameters<typeof writeAuditLog>[1]
) => Promise<void>;

export type AuditContext = {
  adminId: string;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
};
