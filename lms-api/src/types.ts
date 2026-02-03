import type { FastifyRequest } from 'fastify';

export type Role = 'admin' | 'tutor';

export type AuthUser = {
  userId: string;
  role: Role;
  tutorId?: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export {};
