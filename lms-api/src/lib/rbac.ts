import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '../types.js';

export function requireRole(role: Role) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (req.user.role !== role) return reply.code(403).send({ error: 'forbidden' });
  };
}

export async function requireTutor(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  if (req.user.role !== 'TUTOR' || !req.user.tutorId) {
    return reply.code(403).send({ error: 'forbidden' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  if (req.user.role !== 'ADMIN') return reply.code(403).send({ error: 'forbidden' });
}
