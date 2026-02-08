import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import {
  ArcadeLeaderboardParamSchema,
  ArcadeLeaderboardQuerySchema,
  ArcadePlayerCreateSchema,
  ArcadeScoreSchema,
  ArcadeSessionEndSchema,
  ArcadeSessionStartSchema,
} from '../lib/schemas.js';

const DEFAULT_AD_RULES = [
  { placement: 'interstitial', cooldownSeconds: 120, maxPerDay: 10 },
  { placement: 'rewarded', cooldownSeconds: 60, maxPerDay: 20 },
  { placement: 'banner', cooldownSeconds: 0, maxPerDay: 1000 },
];

function normalizeTitle(gameId: string, gameTitle?: string) {
  const trimmed = (gameTitle ?? '').trim();
  return trimmed ? trimmed : gameId;
}

export async function arcadeRoutes(app: FastifyInstance) {
  const respondDbError = (reply: any, err: unknown) => {
    app.log?.error?.(err);
    return reply.code(503).send({ ok: false, error: 'offline' });
  };

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

    const { playerId, gameId, gameTitle } = parsed.data;

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
        `insert into arcade_sessions (player_id, game_id)
         values ($1, $2)
         returning id, started_at`,
        [playerId, gameId]
      );

      const row = res.rows[0];
      return reply.code(201).send({
        session: {
          id: row.id,
          playerId,
          gameId,
          startedAt: row.started_at,
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

    const { playerId, gameId, gameTitle, score } = parsed.data;

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
        `insert into arcade_scores (player_id, game_id, score)
         values ($1, $2, $3)
         returning id, created_at`,
        [playerId, gameId, score]
      );

      return reply.code(201).send({
        ok: true,
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
         where s.game_id = $1
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
}
