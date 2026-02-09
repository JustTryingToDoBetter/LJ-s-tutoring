import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import {
  ArcadeAdEventSchema,
  ArcadeGameplayEventSchema,
  ArcadeLeaderboardParamSchema,
  ArcadeLeaderboardQuerySchema,
  ArcadeMatchEventSchema,
  ArcadePlayerCreateSchema,
  ArcadeScoreSchema,
  ArcadeSessionEndSchema,
  ArcadeSessionStartSchema,
  ArcadeValidationSchema,
} from '../lib/schemas.js';
import { hashFingerprint, signArcadeSessionToken, verifyArcadeSessionToken } from '../lib/arcade-tokens.js';
import { summarizeTelemetry, validateScore } from '../domains/arcade/score-validation.js';

const DEFAULT_AD_RULES = [
  { placement: 'menu_banner', cooldownSeconds: 60, maxPerDay: 1000 },
  { placement: 'pause_screen_banner', cooldownSeconds: 90, maxPerDay: 40 },
  { placement: 'post_run_reward', cooldownSeconds: 120, maxPerDay: 20 },
];

const DEFAULT_AD_GUARDRAILS = {
  maxCreativeKb: Number(process.env.ARCADE_AD_MAX_KB ?? 256),
  maxLoadMs: Number(process.env.ARCADE_AD_MAX_LOAD_MS ?? 2500),
};

function normalizeTitle(gameId: string, gameTitle?: string) {
  const trimmed = (gameTitle ?? '').trim();
  return trimmed ? trimmed : gameId;
}

export async function arcadeRoutes(app: FastifyInstance) {
  const respondDbError = (reply: any, err: unknown) => {
    app.log?.error?.(err);
    return reply.code(503).send({ ok: false, error: 'offline' });
  };

  const tokenSecret = process.env.ARCADE_SESSION_SECRET
    ?? process.env.JWT_SECRET
    ?? process.env.COOKIE_SECRET;

  app.post('/player', {
    config: {
      rateLimit: { max: 240, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    const parsed = ArcadePlayerCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const nickname = parsed.data.nickname?.trim() || null;

    try {
      const res = await pool.query(
        `insert into arcade_players (nickname)
         values ($1)
         returning id, nickname, created_at`,
        [nickname]
      );

      const row = res.rows[0];
      return reply.code(201).send({
        player: {
          id: row.id,
          nickname: row.nickname,
          createdAt: row.created_at,
        }
      });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.post('/session/start', {
    config: {
      rateLimit: { max: 240, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    const parsed = ArcadeSessionStartSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { playerId, gameId, gameTitle, clientFingerprint } = parsed.data;
    const fingerprintHash = clientFingerprint ? hashFingerprint(clientFingerprint) : null;

    try {
      const exists = await pool.query(
        'select 1 from arcade_players where id = $1',
        [playerId]
      );
      if (exists.rowCount === 0) {
        return reply.code(404).send({ error: 'player_not_found' });
      }

      const title = normalizeTitle(gameId, gameTitle);
      await pool.query(
        `insert into arcade_games (id, title)
         values ($1, $2)
         on conflict (id) do update set title = excluded.title`,
        [gameId, title]
      );

      const res = await pool.query(
        `insert into arcade_sessions (player_id, game_id, client_fingerprint_hash)
         values ($1, $2, $3)
         returning id, started_at`,
        [playerId, gameId, fingerprintHash]
      );

      if (!tokenSecret) {
        return reply.code(500).send({ error: 'token_signing_unavailable' });
      }

      const issuedAt = new Date();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const nonce = crypto.randomBytes(16).toString('hex');

      await pool.query(
        `insert into arcade_session_tokens
         (session_id, nonce, issued_at, expires_at, client_fingerprint_hash)
         values ($1, $2, $3::timestamptz, $4::timestamptz, $5)`,
        [res.rows[0].id, nonce, issuedAt.toISOString(), expiresAt.toISOString(), fingerprintHash]
      );

      const sessionToken = signArcadeSessionToken({
        sessionId: res.rows[0].id,
        playerId,
        gameId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        nonce,
        clientFingerprintHash: fingerprintHash ?? undefined,
      }, tokenSecret);

      const row = res.rows[0];
      return reply.code(201).send({
        session: {
          id: row.id,
          playerId,
          gameId,
          startedAt: row.started_at,
          token: sessionToken,
          expiresAt: expiresAt.toISOString(),
        }
      });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.post('/session/end', {
    config: {
      rateLimit: { max: 240, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    const parsed = ArcadeSessionEndSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { sessionId, endedAt } = parsed.data;

    try {
      const res = await pool.query(
        `update arcade_sessions
         set ended_at = coalesce($2::timestamptz, now())
         where id = $1
         returning id, ended_at`,
        [sessionId, endedAt ?? null]
      );

      if (res.rowCount === 0) {
        return reply.code(404).send({ error: 'session_not_found' });
      }

      return reply.send({
        ok: true,
        session: {
          id: res.rows[0].id,
          endedAt: res.rows[0].ended_at,
        }
      });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.post('/score', {
    config: {
      rateLimit: { max: 360, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    const parsed = ArcadeScoreSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { playerId, gameId, gameTitle, score, sessionId, sessionToken, telemetry } = parsed.data;

    if (!tokenSecret) {
      return reply.code(500).send({ error: 'token_signing_unavailable' });
    }

    const decoded = verifyArcadeSessionToken(sessionToken, tokenSecret);
    if (!decoded) {
      return reply.code(401).send({ error: 'invalid_session_token' });
    }

    if (decoded.sessionId !== sessionId || decoded.playerId !== playerId || decoded.gameId !== gameId) {
      return reply.code(401).send({ error: 'session_token_mismatch' });
    }

    if (new Date(decoded.expiresAt).getTime() <= Date.now()) {
      return reply.code(401).send({ error: 'session_token_expired' });
    }

    try {
      const sessionRes = await pool.query(
        `select id, player_id, game_id, started_at, ended_at, client_fingerprint_hash
         from arcade_sessions
         where id = $1`,
        [sessionId]
      );

      if (sessionRes.rowCount === 0) {
        return reply.code(404).send({ error: 'session_not_found' });
      }

      const sessionRow = sessionRes.rows[0] as {
        id: string;
        player_id: string;
        game_id: string;
        started_at: Date;
        ended_at: Date | null;
        client_fingerprint_hash: string | null;
      };

      if (sessionRow.player_id !== playerId || sessionRow.game_id !== gameId) {
        return reply.code(401).send({ error: 'session_token_mismatch' });
      }

      const tokenRes = await pool.query(
        `select id, expires_at, revoked_at, client_fingerprint_hash
         from arcade_session_tokens
         where session_id = $1 and nonce = $2`,
        [sessionId, decoded.nonce]
      );

      if (tokenRes.rowCount === 0) {
        return reply.code(401).send({ error: 'session_token_not_found' });
      }

      const tokenRow = tokenRes.rows[0] as {
        expires_at: Date;
        revoked_at: Date | null;
        client_fingerprint_hash: string | null;
      };

      if (tokenRow.revoked_at || tokenRow.expires_at.getTime() <= Date.now()) {
        return reply.code(401).send({ error: 'session_token_expired' });
      }

      if (sessionRow.client_fingerprint_hash && decoded.clientFingerprintHash
        && sessionRow.client_fingerprint_hash !== decoded.clientFingerprintHash) {
        return reply.code(401).send({ error: 'session_token_fingerprint_mismatch' });
      }

      const exists = await pool.query(
        'select 1 from arcade_players where id = $1',
        [playerId]
      );
      if (exists.rowCount === 0) {
        return reply.code(404).send({ error: 'player_not_found' });
      }

      const title = normalizeTitle(gameId, gameTitle);
      await pool.query(
        `insert into arcade_games (id, title)
         values ($1, $2)
         on conflict (id) do update set title = excluded.title`,
        [gameId, title]
      );

      const validation = validateScore({
        session: sessionRow,
        payload: { score },
        telemetry: telemetry ?? undefined,
      });

      if (!validation.valid) {
        await pool.query(
          `insert into arcade_score_quarantine
           (session_id, player_id, game_id, score, payload_json, telemetry_json, risk_score, reason_code)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
          [
            sessionId,
            playerId,
            gameId,
            score,
            JSON.stringify({ playerId, gameId, score }),
            JSON.stringify(summarizeTelemetry(telemetry) ?? {}),
            validation.risk_score,
            validation.reason ?? null,
          ]
        );

        return reply.code(422).send({
          ok: false,
          error: 'score_quarantined',
          reason: validation.reason ?? 'score_not_validated',
          riskScore: validation.risk_score,
        });
      }

      const res = await pool.query(
        `insert into arcade_scores (player_id, game_id, session_id, score, is_validated)
         values ($1, $2, $3, $4, true)
         returning id, created_at`,
        [playerId, gameId, sessionId, score]
      );

      await pool.query(
        `insert into arcade_score_validations
         (score_id, session_id, player_id, game_id, risk_score, reason_code, validator, telemetry_json)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          res.rows[0].id,
          sessionId,
          playerId,
          gameId,
          validation.risk_score,
          validation.reason ?? null,
          'rule_engine',
          JSON.stringify(summarizeTelemetry(telemetry) ?? {}),
        ]
      );

      return reply.code(201).send({
        ok: true,
        validation: {
          riskScore: validation.risk_score,
          reason: validation.reason ?? null,
        },
        score: {
          id: res.rows[0].id,
          playerId,
          gameId,
          score,
          createdAt: res.rows[0].created_at,
        }
      });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.get('/leaderboard/:game', async (req, reply) => {
    const params = ArcadeLeaderboardParamSchema.safeParse(req.params ?? {});
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const query = ArcadeLeaderboardQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: 'invalid_request', details: query.error.flatten() });
    }

    const gameId = params.data.game;
    const limit = query.data.limit;

    try {
      const res = await pool.query(
        `select s.score, s.created_at, p.id as player_id, p.nickname
         from arcade_scores s
         join arcade_players p on p.id = s.player_id
         where s.game_id = $1 and s.is_validated = true
         order by s.score desc, s.created_at asc
         limit $2`,
        [gameId, limit]
      );

      const entries = res.rows.map((row: any) => ({
        playerId: row.player_id,
        nickname: row.nickname,
        score: row.score,
        createdAt: row.created_at,
      }));

      return reply.send({ gameId, entries });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.get('/ad-rules', async (_req, reply) => {
    try {
      const res = await pool.query(
        `select placement, cooldown_seconds, max_per_day
         from arcade_ad_rules
         order by placement asc`
      );

      const rules = res.rows.length
        ? res.rows.map((row: any) => ({
          placement: row.placement,
          cooldownSeconds: row.cooldown_seconds,
          maxPerDay: row.max_per_day,
        }))
        : DEFAULT_AD_RULES;

      return reply.send({ rules });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.get('/ad-config', async (_req, reply) => {
    const allowlistRaw = process.env.ARCADE_AD_ALLOWLIST ?? 'house';
    const allowlist = allowlistRaw.split(',').map((item) => item.trim()).filter(Boolean);
    const blocked = await pool.query(
      `select provider, creative_id, reason, blocked_at
       from arcade_ad_blocklist
       order by blocked_at desc
       limit 200`
    );

    return reply.send({
      allowlist,
      placements: DEFAULT_AD_RULES,
      guardrails: DEFAULT_AD_GUARDRAILS,
      blockedCreatives: blocked.rows,
    });
  });

  app.post('/events/gameplay', async (req, reply) => {
    const parsed = ArcadeGameplayEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const event = parsed.data;
    try {
      const res = await pool.query(
        `insert into arcade_gameplay_events
         (event_id, event_type, occurred_at, session_id, user_id, anon_id, source, dedupe_key, payload_json)
         values ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9::jsonb)
         on conflict (dedupe_key) do nothing`,
        [
          event.eventId,
          event.eventType,
          event.occurredAt,
          event.sessionId ?? null,
          event.userId ?? null,
          event.anonId ?? null,
          event.source ?? null,
          event.dedupeKey,
          JSON.stringify(event.payload ?? {}),
        ]
      );

      const deduped = res.rowCount === 0;
      return reply.send({ ok: true, deduped });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.post('/events/ad', async (req, reply) => {
    const parsed = ArcadeAdEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const event = parsed.data;
    const allowlistRaw = process.env.ARCADE_AD_ALLOWLIST ?? 'house';
    const allowlist = allowlistRaw.split(',').map((item) => item.trim()).filter(Boolean);
    if (event.provider && !allowlist.includes(event.provider)) {
      return reply.code(403).send({ error: 'provider_not_allowlisted' });
    }
    const creativeMeta = event.payload?.creativeMeta || {};
    const creativeSizeKb = Number(creativeMeta.sizeKb ?? event.payload?.sizeKb ?? 0);
    const loadMs = Number(creativeMeta.loadMs ?? event.payload?.loadMs ?? 0);

    try {
      const res = await pool.query(
        `insert into arcade_ad_events
         (event_id, event_type, occurred_at, session_id, user_id, anon_id, source, dedupe_key, placement, provider, creative_id, variant_id, payload_json)
         values ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         on conflict (dedupe_key) do nothing`,
        [
          event.eventId,
          event.eventType,
          event.occurredAt,
          event.sessionId ?? null,
          event.userId ?? null,
          event.anonId ?? null,
          event.source ?? null,
          event.dedupeKey,
          event.placement ?? null,
          event.provider ?? null,
          event.creativeId ?? null,
          event.variantId ?? null,
          JSON.stringify(event.payload ?? {}),
        ]
      );

      if (event.provider && event.creativeId
        && (creativeSizeKb > DEFAULT_AD_GUARDRAILS.maxCreativeKb || loadMs > DEFAULT_AD_GUARDRAILS.maxLoadMs)) {
        await pool.query(
          `insert into arcade_ad_blocklist (provider, creative_id, reason)
           values ($1, $2, $3)
           on conflict (provider, creative_id)
           do update set last_seen_at = now(), seen_count = arcade_ad_blocklist.seen_count + 1`,
          [
            event.provider,
            event.creativeId,
            creativeSizeKb > DEFAULT_AD_GUARDRAILS.maxCreativeKb ? 'creative_too_large' : 'creative_too_slow',
          ]
        );
      }

      const deduped = res.rowCount === 0;
      return reply.send({ ok: true, deduped });
    } catch (err) {
      return respondDbError(reply, err);
    }
  });

  app.post('/match/events', async (req, reply) => {
    const parsed = ArcadeMatchEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    return reply.code(501).send({
      ok: false,
      error: 'not_implemented',
      message: 'Multiplayer event ingestion is not enabled yet.'
    });
  });

  app.post('/match/validate', async (req, reply) => {
    const parsed = ArcadeValidationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    return reply.code(501).send({
      ok: false,
      error: 'not_implemented',
      message: 'Server-side validation hooks are not enabled yet.'
    });
  });
}
