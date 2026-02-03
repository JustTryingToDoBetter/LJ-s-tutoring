import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser } from '../types.js';

type JwtPayload = {
  userId: string;
  role: 'admin' | 'tutor';
  tutorId?: string;
};

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');

  app.register(jwt, {
    secret,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const decoded = await req.jwtVerify<JwtPayload>();
      const user: AuthUser = {
        userId: decoded.userId,
        role: decoded.role,
        tutorId: decoded.tutorId,
      };
      req.user = user;
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
