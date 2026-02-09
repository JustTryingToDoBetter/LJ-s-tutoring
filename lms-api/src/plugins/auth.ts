import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser, ImpersonationContext } from '../types.js';
import { pool } from '../db/pool.js';
import { hashToken } from '../lib/security.js';

type JwtPayload = {
  userId: string;
  role: 'ADMIN' | 'TUTOR';
  tutorId?: string;
};

type ImpersonationPayload = {
  adminUserId: string;
  tutorId: string;
  tutorUserId: string;
  impersonationId: string;
  sessionHash: string;
  mode: 'READ_ONLY';
};

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET ?? process.env.COOKIE_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');

  app.register(jwt, {
    secret,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const path = req.routeOptions?.url ?? req.url ?? '';
      const isTutorRoute = path.startsWith('/tutor');
      const impersonationToken = req.cookies?.impersonation;

      if (isTutorRoute && impersonationToken) {
        const sessionToken = req.cookies?.session;
        if (!sessionToken) return reply.code(401).send({ error: 'unauthorized' });

        const sessionDecoded = await app.jwt.verify<JwtPayload>(sessionToken);
        if (sessionDecoded.role !== 'ADMIN') {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        const decoded = await app.jwt.verify<ImpersonationPayload>(impersonationToken);
        if (decoded.mode !== 'READ_ONLY') {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        const sessionHash = hashToken(sessionToken);
        if (decoded.sessionHash !== sessionHash) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        if (decoded.adminUserId !== sessionDecoded.userId) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        const check = await pool.query(
          `select admin_user_id, tutor_id, tutor_user_id, revoked_at, expires_at
           from impersonation_sessions
           where id = $1`,
          [decoded.impersonationId]
        );

        if (check.rowCount === 0) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        const row = check.rows[0] as {
          admin_user_id: string;
          tutor_id: string;
          tutor_user_id: string;
          revoked_at: Date | null;
          expires_at: Date;
        };

        if (row.revoked_at || row.expires_at.getTime() <= Date.now()) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        if (row.admin_user_id !== decoded.adminUserId
          || row.tutor_id !== decoded.tutorId
          || row.tutor_user_id !== decoded.tutorUserId) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        const user: AuthUser = {
          userId: decoded.tutorUserId,
          role: 'TUTOR',
          tutorId: decoded.tutorId,
        };
        req.user = user;
        const impersonation: ImpersonationContext = {
          adminUserId: decoded.adminUserId,
          tutorId: decoded.tutorId,
          tutorUserId: decoded.tutorUserId,
          impersonationId: decoded.impersonationId,
          mode: decoded.mode,
        };
        req.impersonation = impersonation;
        return;
      }

      const token = req.cookies?.session;
      if (!token) return reply.code(401).send({ error: 'unauthorized' });

      const decoded = await app.jwt.verify<JwtPayload>(token);
      const user: AuthUser = {
        userId: decoded.userId,
        role: decoded.role,
        tutorId: decoded.tutorId,
      };
      req.user = user;
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
