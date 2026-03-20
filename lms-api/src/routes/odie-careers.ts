import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../lib/rbac.js';
import {
  OdieCareerIdParamSchema,
  OdieCareersEligibilityRequestSchema,
  OdieCareersSearchQuerySchema,
} from '../lib/schemas.js';
import {
  evaluateStudentProfile,
  getCareerDetail,
  getOdieCareersOverview,
  searchCareerSummaries,
} from '../domains/odie-careers/service.js';

function setPrivateNoStore(reply: any) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function odieCareersPreHandler(app: FastifyInstance) {
  const devBypassEnabled = process.env.ODIE_CAREERS_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
  if (devBypassEnabled) {
    return [];
  }
  return [app.authenticate, requireAuth, requireRole('STUDENT')];
}

export async function odieCareersRoutes(app: FastifyInstance) {
  app.get('/odie-careers/overview', {
    preHandler: odieCareersPreHandler(app),
  }, async (_req, reply) => {
    setPrivateNoStore(reply);
    return reply.send(getOdieCareersOverview());
  });

  app.get('/odie-careers/careers', {
    preHandler: odieCareersPreHandler(app),
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = OdieCareersSearchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    return reply.send({ items: searchCareerSummaries(parsed.data.q) });
  });

  app.get('/odie-careers/careers/:careerId', {
    preHandler: odieCareersPreHandler(app),
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = OdieCareerIdParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const detail = getCareerDetail(parsed.data.careerId);
    if (!detail) {
      return reply.code(404).send({ error: 'career_not_found' });
    }
    return reply.send(detail);
  });

  app.post('/odie-careers/eligibility/evaluate', {
    preHandler: odieCareersPreHandler(app),
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = OdieCareersEligibilityRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    return reply.send(evaluateStudentProfile(parsed.data));
  });
}
