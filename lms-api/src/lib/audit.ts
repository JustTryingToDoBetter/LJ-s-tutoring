type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export type AuditEntry = {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: any;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export async function writeAuditLog(client: Queryable, entry: AuditEntry) {
  const params = [
    entry.actorUserId ?? null,
    entry.actorRole ?? null,
    entry.action,
    entry.entityType ?? null,
    entry.entityId ?? null,
    entry.meta ? JSON.stringify(entry.meta) : null,
    entry.ip ?? null,
    entry.userAgent ?? null,
    entry.correlationId ?? null
  ];

  await client.query(
    `insert into audit_log
     (actor_user_id, actor_role, action, entity_type, entity_id, meta_json, ip, user_agent, correlation_id)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
    params
  );
}

export function safeAuditMeta(meta: any) {
  if (meta == null) return null;
  try {
    JSON.stringify(meta);
    return meta;
  } catch {
    return { note: 'meta_unserializable' };
  }
}
