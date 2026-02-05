import type { FastifyRequest } from 'fastify';
import '@fastify/cookie';

export type Role = 'ADMIN' | 'TUTOR';

export type AuthUser = {
  userId: string;
  role: Role;
  tutorId?: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export {};
