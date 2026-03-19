import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole, requireTutor } from '../lib/rbac.js';
import { IdParamSchema, UserTierSchema, VaultListQuerySchema, VaultResourceCreateSchema, VaultResourceUpdateSchema } from '../lib/schemas.js';
import { parsePagination } from '../lib/pagination.js';

function setPrivateNoStore(reply: FastifyReply) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

async function getUserTier(userId: string) {
  const res = await pool.query(
    `select tier::text as tier
     from users
     where id = $1`,
    [userId]
  );
  return String(res.rows[0]?.tier || 'BASIC') as 'BASIC' | 'PREMIUM';
}

async function canAccessResource(resourceId: string, role: string, tier: 'BASIC' | 'PREMIUM') {
  const res = await pool.query(
    `select
       vr.id,
       vr.minimum_tier::text as minimum_tier,
       vr.is_published,
       vr.is_public_preview,
       exists (
         select 1
         from vault_access_rules var
         where var.resource_id = vr.id
           and var.role = $2::role
           and var.is_allowed = true
       ) as role_allowed
     from vault_resources vr
     where vr.id = $1`,
    [resourceId, role]
  );

  if (Number(res.rowCount || 0) === 0) return { exists: false, allowed: false, preview: false };
  const row = res.rows[0] as {
    minimum_tier: 'BASIC' | 'PREMIUM';
    is_published: boolean;
    is_public_preview: boolean;
    role_allowed: boolean;
  };

  if (!row.is_published) return { exists: true, allowed: false, preview: false };
  if (!row.role_allowed) return { exists: true, allowed: false, preview: false };
  if (row.minimum_tier === 'PREMIUM' && tier !== 'PREMIUM') {
    return { exists: true, allowed: false, preview: row.is_public_preview };
  }

  return { exists: true, allowed: true, preview: false };
}

export async function vaultRoutes(app: FastifyInstance) {
  app.get('/vault', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);

    if (!['STUDENT', 'TUTOR', 'PARENT'].includes(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = VaultListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });
    const role = req.user!.role;
    const userTier = await getUserTier(req.user!.userId);

    const filters: string[] = [
      `vr.is_published = true`,
      `exists (
        select 1 from vault_access_rules var
        where var.resource_id = vr.id
          and var.role = $1::role
          and var.is_allowed = true
      )`
    ];
    const params: any[] = [role, userTier];

    if (parsed.data.category) {
      params.push(parsed.data.category);
      filters.push(`vr.category = $${params.length}`);
    }

    if (parsed.data.q) {
      params.push(`%${parsed.data.q}%`);
      filters.push(`(
        vr.title ilike $${params.length}
        or coalesce(vr.description, '') ilike $${params.length}
        or vr.body_markdown ilike $${params.length}
      )`);
    }

    const res = await pool.query(
      `select
         vr.id,
         vr.title,
         vr.description,
         vr.category,
         vr.minimum_tier::text as minimum_tier,
         vr.is_public_preview,
         vr.created_at,
         (select count(*)::int from vault_assets va where va.resource_id = vr.id) as asset_count,
         (
           case
             when vr.minimum_tier = 'PREMIUM' and $2::text <> 'PREMIUM' then false
             else true
           end
         ) as unlocked
       from vault_resources vr
       where ${filters.join(' and ')}
       order by vr.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)
       from vault_resources vr
       where ${filters.join(' and ')}`,
      params
    );

    return reply.send({
      items: res.rows,
      total: Number(totalRes.rows[0]?.count || 0),
      page,
      pageSize,
      tier: userTier
    });
  });

  app.get('/vault/:id', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    if (!['STUDENT', 'TUTOR', 'PARENT'].includes(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const userTier = await getUserTier(req.user!.userId);
    const access = await canAccessResource(params.data.id, req.user!.role, userTier);
    if (!access.exists) return reply.code(404).send({ error: 'resource_not_found' });

    const resourceRes = await pool.query(
      `select id, title, description, category, body_markdown, minimum_tier::text as minimum_tier,
              is_public_preview, created_at, updated_at
       from vault_resources
       where id = $1`,
      [params.data.id]
    );

    const resource = resourceRes.rows[0];

    if (!access.allowed && !access.preview) {
      return reply.code(403).send({ error: 'vault_tier_upgrade_required', minimumTier: resource.minimum_tier });
    }

    const assetsRes = await pool.query(
      `select id, file_name, mime_type, created_at
       from vault_assets
       where resource_id = $1
       order by created_at desc`,
      [params.data.id]
    );

    const body = access.allowed
      ? resource.body_markdown
      : String(resource.body_markdown || '').slice(0, 220);

    return reply.send({
      resource: {
        ...resource,
        body_markdown: body,
        locked: !access.allowed,
      },
      assets: access.allowed ? assetsRes.rows : []
    });
  });

  app.get('/vault/assets/:id', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    if (!['STUDENT', 'TUTOR', 'PARENT'].includes(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const res = await pool.query(
      `select va.id, va.resource_id, va.file_name, va.mime_type, va.content_text
       from vault_assets va
       where va.id = $1`,
      [params.data.id]
    );

    if (Number(res.rowCount || 0) === 0) {
      return reply.code(404).send({ error: 'asset_not_found' });
    }

    const userTier = await getUserTier(req.user!.userId);
    const asset = res.rows[0] as {
      id: string;
      resource_id: string;
      file_name: string;
      mime_type: string;
      content_text: string;
    };

    const access = await canAccessResource(asset.resource_id, req.user!.role, userTier);
    if (!access.allowed) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    reply.header('Content-Type', asset.mime_type || 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `inline; filename="${asset.file_name}"`);
    return reply.send(asset.content_text);
  });

  app.get('/tutor/vault', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    setPrivateNoStore(reply);

    const parsed = VaultListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });

    const res = await pool.query(
      `select id, title, description, category, minimum_tier::text as minimum_tier, is_published, is_public_preview, created_at, updated_at
       from vault_resources
       where created_by_user_id = $1
       order by created_at desc
       limit $2 offset $3`,
      [req.user!.userId, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)
       from vault_resources
       where created_by_user_id = $1`,
      [req.user!.userId]
    );

    return reply.send({
      items: res.rows,
      total: Number(totalRes.rows[0]?.count || 0),
      page,
      pageSize
    });
  });

  app.post('/tutor/vault', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    const parsed = VaultResourceCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resourceRes = await client.query(
        `insert into vault_resources (
          title,
          description,
          category,
          body_markdown,
          minimum_tier,
          is_published,
          is_public_preview,
          created_by_user_id
        ) values ($1, $2, $3, $4, $5::user_tier, $6, $7, $8)
        returning id, title, description, category, minimum_tier::text as minimum_tier, is_published, is_public_preview, created_at, updated_at`,
        [
          parsed.data.title,
          parsed.data.description ?? null,
          parsed.data.category ?? null,
          parsed.data.bodyMarkdown,
          parsed.data.minimumTier,
          parsed.data.isPublished,
          parsed.data.isPublicPreview,
          req.user!.userId
        ]
      );

      const resourceId = String(resourceRes.rows[0].id);

      for (const role of parsed.data.allowedRoles) {
        await client.query(
          `insert into vault_access_rules (resource_id, role, is_allowed)
           values ($1, $2::role, true)
           on conflict (resource_id, role) do update set is_allowed = true`,
          [resourceId, role]
        );
      }

      for (const asset of parsed.data.assets) {
        await client.query(
          `insert into vault_assets (resource_id, file_name, mime_type, content_text)
           values ($1, $2, $3, $4)`,
          [resourceId, asset.fileName, asset.mimeType, asset.contentText]
        );
      }

      await client.query('COMMIT');

      return reply.code(201).send({ resource: resourceRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.patch('/tutor/vault/:id', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const parsed = VaultResourceUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    if (parsed.data.minimumTier) {
      const tierParsed = UserTierSchema.safeParse(parsed.data.minimumTier);
      if (!tierParsed.success) {
        return reply.code(400).send({ error: 'invalid_tier' });
      }
    }

    const currentRes = await pool.query(
      `select id
       from vault_resources
       where id = $1
         and created_by_user_id = $2`,
      [params.data.id, req.user!.userId]
    );

    if (Number(currentRes.rowCount || 0) === 0) {
      return reply.code(404).send({ error: 'resource_not_found' });
    }

    const currentFields = await pool.query(
      `select title, description, category, body_markdown, minimum_tier::text as minimum_tier, is_published, is_public_preview
       from vault_resources
       where id = $1`,
      [params.data.id]
    );

    const row = currentFields.rows[0] as {
      title: string;
      description: string | null;
      category: string | null;
      body_markdown: string;
      minimum_tier: 'BASIC' | 'PREMIUM';
      is_published: boolean;
      is_public_preview: boolean;
    };

    const updatedRes = await pool.query(
      `update vault_resources
       set title = $1,
           description = $2,
           category = $3,
           body_markdown = $4,
           minimum_tier = $5::user_tier,
           is_published = $6,
           is_public_preview = $7,
           updated_at = now()
       where id = $8
       returning id, title, description, category, body_markdown, minimum_tier::text as minimum_tier, is_published, is_public_preview, created_at, updated_at`,
      [
        parsed.data.title ?? row.title,
        parsed.data.description ?? row.description,
        parsed.data.category ?? row.category,
        parsed.data.bodyMarkdown ?? row.body_markdown,
        parsed.data.minimumTier ?? row.minimum_tier,
        parsed.data.isPublished ?? row.is_published,
        parsed.data.isPublicPreview ?? row.is_public_preview,
        params.data.id
      ]
    );

    if (parsed.data.allowedRoles) {
      await pool.query(
        `delete from vault_access_rules where resource_id = $1`,
        [params.data.id]
      );
      for (const role of parsed.data.allowedRoles) {
        await pool.query(
          `insert into vault_access_rules (resource_id, role, is_allowed)
           values ($1, $2::role, true)`,
          [params.data.id, role]
        );
      }
    }

    return reply.send({ resource: updatedRes.rows[0] });
  });
}
