import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../lib/rbac.js';
import {
  OdieCareerIdParamSchema,
  OdieCareersEligibilityRequestSchema,
  OdieCareersSearchQuerySchema,
  OdieReadinessCompleteBodySchema,
  OdieReadinessMilestoneParamSchema,
  OdieReadinessPlanQuerySchema,
} from '../lib/schemas.js';
import {
  completeReadinessMilestone,
  evaluateStudentProfile,
  getCareerDetail,
  getOdieCareersOverview,
  getReadinessPlanForCareer,
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

function resolveReadinessStudentId(req: any, fallbackStudentId?: string) {
  if (req.user?.studentId) {
    return req.user.studentId as string;
  }
  if (process.env.ODIE_CAREERS_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
    return fallbackStudentId || 'dev-student';
  }
  return null;
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

  app.get('/odie-careers/readiness/plan', {
    preHandler: odieCareersPreHandler(app),
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = OdieReadinessPlanQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const studentId = resolveReadinessStudentId(req, parsed.data.studentId);
    if (!studentId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const plan = getReadinessPlanForCareer(studentId, parsed.data.careerId);
    if (!plan) {
      return reply.code(404).send({ error: 'career_not_found' });
    }
    return reply.send(plan);
  });

  app.post('/odie-careers/readiness/milestone/:id/complete', {
    preHandler: odieCareersPreHandler(app),
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = OdieReadinessMilestoneParamSchema.safeParse(req.params ?? {});
    const body = OdieReadinessCompleteBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten(),
        },
      });
    }

    const studentId = resolveReadinessStudentId(req);
    if (!studentId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const completion = completeReadinessMilestone(studentId, body.data.careerId, params.data.id, body.data);
    if ('error' in completion) {
      if (completion.error === 'career_not_found' || completion.error === 'milestone_not_found') {
        return reply.code(404).send(completion);
      }
      if (completion.error === 'evidence_required') {
        return reply.code(422).send(completion);
      }
      return reply.code(400).send(completion);
    }

    return reply.send(completion);
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
