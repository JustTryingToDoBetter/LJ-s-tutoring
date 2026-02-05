import type { FastifyRequest } from 'fastify';
import '@fastify/cookie';

export type Role = 'ADMIN' | 'TUTOR';

export type AuthUser = {
  userId: string;
  role: Role;
  tutorId?: string;
};

export type ImpersonationContext = {
  adminUserId: string;
  tutorId: string;
  tutorUserId: string;
  impersonationId: string;
  mode: 'READ_ONLY';
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
    impersonation?: ImpersonationContext;
  }
}

export {};
