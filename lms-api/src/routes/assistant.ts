import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole, requireTutor } from '../lib/rbac.js';
import { AssistantMessageCreateSchema, AssistantThreadCreateSchema, IdParamSchema, OdieProxyChatSchema } from '../lib/schemas.js';

type AllowedOwnerRole = 'STUDENT' | 'TUTOR';

type RetrievedChunk = {
  resourceId: string;
  title: string;
  snippet: string;
  confidence: number;
};

const inMemoryLimiter = new Map<string, { count: number; resetAt: number }>();

function setPrivateNoStore(reply: FastifyReply) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function applyAssistantRateLimit(userId: string) {
  const maxAttempts = Number(process.env.ASSISTANT_MAX_REQUESTS_PER_MIN ?? 20);
  const now = Date.now();
  const current = inMemoryLimiter.get(userId);
  if (!current || current.resetAt <= now) {
    inMemoryLimiter.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (current.count >= maxAttempts) {
    return true;
  }
  current.count += 1;
  return false;
}

function makeAssistantReply(question: string, chunks: RetrievedChunk[]) {
  const normalizedQuestion = question.trim();
  if (!chunks.length) {
    return {
      text: `I could not find a high-confidence source for: "${normalizedQuestion}". Try rephrasing with a specific topic or keyword from your lessons.`,
      citations: []
    };
  }

  const lead = chunks[0];
  const supporting = chunks.slice(1, 3);
  const supportText = supporting.length
    ? ` Supporting points were checked in ${supporting.map((item) => item.title).join(', ')}.`
    : '';

  const text = [
    `Based on ${lead.title}, here is a focused answer:`,
    lead.snippet,
    supportText.trim()
  ].filter(Boolean).join(' ');

  return {
    text,
    citations: chunks
  };
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

async function retrieveVaultChunks(params: {
  role: 'STUDENT' | 'TUTOR';
  userTier: 'BASIC' | 'PREMIUM';
  query: string;
}) {
  const rankExpr = `ts_rank(
    to_tsvector('english', coalesce(vr.title, '') || ' ' || coalesce(vr.description, '') || ' ' || coalesce(vr.body_markdown, '')),
    plainto_tsquery('english', $3)
  )`;

  const exactRes = await pool.query(
    `select
       vr.id,
       vr.title,
       left(regexp_replace(vr.body_markdown, '\\s+', ' ', 'g'), 260) as snippet,
       ${rankExpr} as rank
     from vault_resources vr
     where vr.is_published = true
       and (
         vr.minimum_tier = 'BASIC'
         or $2::text = 'PREMIUM'
         or vr.is_public_preview = true
       )
       and exists (
         select 1
         from vault_access_rules var
         where var.resource_id = vr.id
           and var.role = $1::role
           and var.is_allowed = true
       )
       and to_tsvector('english', coalesce(vr.title, '') || ' ' || coalesce(vr.description, '') || ' ' || coalesce(vr.body_markdown, '')) @@ plainto_tsquery('english', $3)
     order by rank desc, vr.created_at desc
     limit 3`,
    [params.role, params.userTier, params.query]
  );

  if (Number(exactRes.rowCount || 0) > 0) {
    return exactRes.rows.map((row) => ({
      resourceId: String(row.id),
      title: String(row.title),
      snippet: String(row.snippet || '').trim(),
      confidence: Math.max(0.2, Math.min(1, Number(row.rank || 0.2)))
    })) as RetrievedChunk[];
  }

  const fallback = await pool.query(
    `select
       vr.id,
       vr.title,
       left(regexp_replace(vr.body_markdown, '\\s+', ' ', 'g'), 260) as snippet
     from vault_resources vr
     where vr.is_published = true
       and (
         vr.minimum_tier = 'BASIC'
         or $2::text = 'PREMIUM'
         or vr.is_public_preview = true
       )
       and exists (
         select 1
         from vault_access_rules var
         where var.resource_id = vr.id
           and var.role = $1::role
           and var.is_allowed = true
       )
     order by vr.created_at desc
     limit 2`,
    [params.role, params.userTier]
  );

  return fallback.rows.map((row, idx) => ({
    resourceId: String(row.id),
    title: String(row.title),
    snippet: String(row.snippet || '').trim(),
    confidence: Math.max(0.1, 0.25 - idx * 0.08)
  })) as RetrievedChunk[];
}

async function resolveScopedProfile(req: FastifyRequest, ownerRole: AllowedOwnerRole) {
  if (ownerRole === 'STUDENT') {
    if (req.user?.studentId) return { studentId: req.user.studentId, tutorId: null as string | null };
    const userRes = await pool.query(
      `select student_id from users where id = $1`,
      [req.user!.userId]
    );
    return {
      studentId: (userRes.rows[0]?.student_id as string | null) ?? null,
      tutorId: null as string | null
    };
  }

  if (req.user?.tutorId) {
    return { studentId: null as string | null, tutorId: req.user.tutorId };
  }
  const userRes = await pool.query(
    `select tutor_profile_id from users where id = $1`,
    [req.user!.userId]
  );
  return {
    studentId: null as string | null,
    tutorId: (userRes.rows[0]?.tutor_profile_id as string | null) ?? null
  };
}

async function ensureThreadOwner(threadId: string, userId: string, ownerRole: AllowedOwnerRole) {
  const res = await pool.query(
    `select id
     from assistant_threads
     where id = $1
       and owner_user_id = $2
       and owner_role = $3::role`,
    [threadId, userId, ownerRole]
  );
  return Number(res.rowCount || 0) > 0;
}

function registerAssistantEndpoints(
  app: FastifyInstance,
  ownerRole: AllowedOwnerRole,
  basePath: string,
  preHandlers: any[]
) {
  app.get(`${basePath}/threads`, { preHandler: preHandlers }, async (req, reply) => {
    setPrivateNoStore(reply);
    const res = await pool.query(
      `select t.id, t.title, t.created_at, t.updated_at,
              (
                select m.content
                from assistant_messages m
                where m.thread_id = t.id
                order by m.created_at desc
                limit 1
              ) as last_message
       from assistant_threads t
       where t.owner_user_id = $1
         and t.owner_role = $2::role
       order by t.updated_at desc
       limit 100`,
      [req.user!.userId, ownerRole]
    );

    return reply.send({ items: res.rows });
  });

  app.post(`${basePath}/threads`, { preHandler: preHandlers }, async (req, reply) => {
    const parsed = AssistantThreadCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const scoped = await resolveScopedProfile(req, ownerRole);
    if (ownerRole === 'STUDENT' && !scoped.studentId) {
      return reply.code(404).send({ error: 'student_not_found' });
    }
    if (ownerRole === 'TUTOR' && !scoped.tutorId) {
      return reply.code(404).send({ error: 'tutor_not_found' });
    }

    const res = await pool.query(
      `insert into assistant_threads (owner_user_id, owner_role, student_id, tutor_id, title)
       values ($1, $2::role, $3, $4, $5)
       returning id, title, created_at, updated_at`,
      [
        req.user!.userId,
        ownerRole,
        scoped.studentId,
        scoped.tutorId,
        parsed.data.title || 'New chat'
      ]
    );

    return reply.code(201).send({ thread: res.rows[0] });
  });

  app.get(`${basePath}/threads/:id`, { preHandler: preHandlers }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const allowed = await ensureThreadOwner(params.data.id, req.user!.userId, ownerRole);
    if (!allowed) return reply.code(404).send({ error: 'thread_not_found' });

    const threadRes = await pool.query(
      `select id, title, created_at, updated_at
       from assistant_threads
       where id = $1`,
      [params.data.id]
    );

    const messagesRes = await pool.query(
      `select m.id, m.author, m.content, m.model, m.metadata_json, m.created_at,
              coalesce(json_agg(json_build_object(
                'id', c.id,
                'resourceId', c.resource_id,
                'snippet', c.snippet,
                'confidence', c.confidence
              )) filter (where c.id is not null), '[]'::json) as citations
       from assistant_messages m
       left join assistant_citations c on c.message_id = m.id
       where m.thread_id = $1
       group by m.id
       order by m.created_at asc`,
      [params.data.id]
    );

    return reply.send({
      thread: threadRes.rows[0],
      messages: messagesRes.rows
    });
  });

  app.post(`${basePath}/threads/:id/messages`, {
    preHandler: preHandlers,
    config: {
      rateLimit: {
        max: Number(process.env.ASSISTANT_RATE_LIMIT_MAX ?? 30),
        timeWindow: process.env.ASSISTANT_RATE_LIMIT_WINDOW ?? '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const parsed = AssistantMessageCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    if (applyAssistantRateLimit(req.user!.userId)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const allowed = await ensureThreadOwner(params.data.id, req.user!.userId, ownerRole);
    if (!allowed) return reply.code(404).send({ error: 'thread_not_found' });

    const dedupeHash = parsed.data.dedupeKey
      ? crypto.createHash('sha256').update(`${req.user!.userId}:${params.data.id}:${parsed.data.dedupeKey}`).digest('hex')
      : null;

    if (dedupeHash) {
      const existing = await pool.query(
        `select id, content, created_at
         from assistant_messages
         where thread_id = $1
           and author = 'assistant'
           and metadata_json ->> 'dedupeHash' = $2
         order by created_at desc
         limit 1`,
        [params.data.id, dedupeHash]
      );
      if (Number(existing.rowCount || 0) > 0) {
        return reply.send({ deduped: true, assistantMessage: existing.rows[0] });
      }
    }

    const startedAt = Date.now();
    await pool.query(
      `insert into assistant_messages (thread_id, author, content, metadata_json)
       values ($1, 'user', $2, $3::jsonb)`,
      [params.data.id, parsed.data.message, JSON.stringify({ dedupeHash })]
    );

    const userTier = await getUserTier(req.user!.userId);
    const retrieved = await retrieveVaultChunks({ role: ownerRole, userTier, query: parsed.data.message });
    const generated = makeAssistantReply(parsed.data.message, retrieved);

    const assistantRes = await pool.query(
      `insert into assistant_messages (thread_id, author, content, model, metadata_json)
       values ($1, 'assistant', $2, $3, $4::jsonb)
       returning id, thread_id, author, content, model, metadata_json, created_at`,
      [
        params.data.id,
        generated.text,
        process.env.ASSISTANT_MODEL_NAME ?? 'odysseus-rag-v1',
        JSON.stringify({
          latencyMs: Date.now() - startedAt,
          dedupeHash,
          retrievalCount: retrieved.length
        })
      ]
    );

    const assistantMessageId = assistantRes.rows[0].id as string;

    for (const chunk of generated.citations) {
      await pool.query(
        `insert into assistant_citations (message_id, resource_id, snippet, confidence)
         values ($1, $2, $3, $4)`,
        [assistantMessageId, chunk.resourceId, chunk.snippet, chunk.confidence]
      );
    }

    await pool.query(
      `update assistant_threads
       set updated_at = now()
       where id = $1`,
      [params.data.id]
    );

    return reply.code(201).send({
      assistantMessage: {
        ...assistantRes.rows[0],
        citations: generated.citations
      }
    });
  });
}

export async function assistantRoutes(app: FastifyInstance) {
  app.post('/assistant/odie-proxy', {
    config: {
      rateLimit: {
        max: Number(process.env.ODIE_PROXY_RATE_LIMIT_MAX ?? 30),
        timeWindow: process.env.ODIE_PROXY_RATE_LIMIT_WINDOW ?? '1 minute'
      }
    }
  }, async (req, reply) => {
    setPrivateNoStore(reply);

    const parsed = OdieProxyChatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return reply.code(503).send({ error: 'groq_not_configured' });
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: process.env.ODIE_GROQ_MODEL || 'llama-3.3-70b-versatile',
          temperature: 0.5,
          max_tokens: parsed.data.maxTokens,
          messages: [{ role: 'system', content: parsed.data.system }]
            .concat(parsed.data.history)
            .concat([{ role: 'user', content: parsed.data.userText }]),
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        req.log.error({ status: response.status, errText }, 'Groq proxy request failed');
        return reply.code(502).send({ error: 'upstream_error' });
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = payload?.choices?.[0]?.message?.content?.trim?.() || '';
      if (!text) {
        return reply.code(502).send({ error: 'empty_response' });
      }

      return reply.send({ text });
    } catch (err) {
      req.log.error({ err }, 'Groq proxy request exception');
      return reply.code(502).send({ error: 'upstream_unreachable' });
    }
  });

  registerAssistantEndpoints(app, 'STUDENT', '/assistant', [app.authenticate, requireAuth, requireRole('STUDENT')]);
  registerAssistantEndpoints(app, 'TUTOR', '/tutor/assistant', [app.authenticate, requireAuth, requireTutor]);
}
