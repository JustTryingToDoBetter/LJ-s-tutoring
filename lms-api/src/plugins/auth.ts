import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser, ImpersonationContext } from '../types.js';

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
      const impersonationHeader = req.headers['x-impersonation-token'];
      const impersonationToken = Array.isArray(impersonationHeader)
        ? impersonationHeader[0]
        : impersonationHeader;

      if (impersonationToken) {
        const decoded = await app.jwt.verify<ImpersonationPayload>(impersonationToken);
        if (decoded.mode !== 'READ_ONLY') {
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
