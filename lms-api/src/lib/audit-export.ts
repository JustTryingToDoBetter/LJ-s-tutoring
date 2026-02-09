type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export type AuditExportFilters = {
  from?: string;
  to?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
};

export function buildAuditFilters(data: AuditExportFilters) {
  const params: any[] = [];
  const filters: string[] = [];
  if (data.from) {
    params.push(data.from);
    filters.push(`a.created_at >= $${params.length}::timestamptz`);
  }
  if (data.to) {
    params.push(`${data.to} 23:59:59`);
    filters.push(`a.created_at <= $${params.length}::timestamptz`);
  }
  if (data.actorId) {
    params.push(data.actorId);
    filters.push(`a.actor_user_id = $${params.length}`);
  }
  if (data.entityType) {
    params.push(data.entityType);
    filters.push(`a.entity_type = $${params.length}`);
  }
  if (data.entityId) {
    params.push(data.entityId);
    filters.push(`a.entity_id = $${params.length}`);
  }

  return {
    params,
    where: filters.length ? `where ${filters.join(' and ')}` : ''
  };
}

const csvValue = (value: any) => {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
};

export async function buildAuditCsv(client: Queryable, filters: AuditExportFilters) {
  const { where, params } = buildAuditFilters(filters);
  const header = 'timestamp,action,entity_type,entity_id,actor_id,actor_email,actor_role,ip,user_agent,correlation_id,meta';
  const rows: string[] = [header];

  const pageSize = 500;
  let page = 1;

  while (true) {
    const offset = (page - 1) * pageSize;
    const res = await client.query(
      `select a.action, a.entity_type, a.entity_id, a.meta_json, a.ip, a.user_agent,
              a.correlation_id, a.created_at, a.actor_user_id,
              u.email as actor_email, u.role as actor_role
       from audit_log a
       left join users u on u.id = a.actor_user_id
       ${where}
       order by a.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    if (res.rowCount === 0) break;

    for (const row of res.rows) {
      const line = [
        csvValue(row.created_at?.toISOString?.() ?? row.created_at),
        csvValue(row.action),
        csvValue(row.entity_type),
        csvValue(row.entity_id),
        csvValue(row.actor_user_id),
        csvValue(row.actor_email),
        csvValue(row.actor_role),
        csvValue(row.ip),
        csvValue(row.user_agent),
        csvValue(row.correlation_id),
        csvValue(row.meta_json)
      ].join(',');
      rows.push(line);
    }

    page += 1;
  }

  return rows.join('\n');
}
