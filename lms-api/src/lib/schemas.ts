import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeString = z.string().regex(/^\d{2}:\d{2}$/);
const SessionStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']);
const TutorStatusSchema = z.enum(['INVITED', 'VERIFIED', 'ACTIVE']);
const QualificationBandSchema = z.enum(['GRADES_6_9', 'GRADES_10_12', 'BOTH']);

export const EmailSchema = z.string().email().transform((s) => s.trim().toLowerCase());

export const PasswordSchema = z
  .string()
  .min(10, 'password_too_short')
  .max(200, 'password_too_long');

export const RegisterAdminSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  bootstrapToken: z.string().min(1),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});

export const TestLoginSchema = z.object({
  role: z.enum(['ADMIN', 'TUTOR']),
  email: EmailSchema,
});

export const MagicLinkRequestSchema = z.object({
  email: EmailSchema,
});

export const CreateTutorSchema = z.object({
  email: EmailSchema,
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  defaultHourlyRate: z.number().min(0).max(10000),
  active: z.boolean().optional().default(true),
  qualificationBand: QualificationBandSchema,
  qualifiedSubjects: z.array(z.string().trim().min(1).max(120)).min(1),
  status: TutorStatusSchema.optional().default('INVITED'),
});

export const UpdateTutorSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  defaultHourlyRate: z.number().min(0).max(10000).optional(),
  active: z.boolean().optional(),
  qualificationBand: QualificationBandSchema.optional(),
  qualifiedSubjects: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
  status: TutorStatusSchema.optional(),
});

export const CreateStudentSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  grade: z.string().trim().max(20).optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  active: z.boolean().optional().default(true),
});

export const UpdateStudentSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  grade: z.string().trim().max(20).optional().nullable(),
  guardianName: z.string().trim().max(120).optional().nullable(),
  guardianPhone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

export const AssignmentSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
  subject: z.string().trim().min(1).max(120),
  startDate: DateString,
  endDate: DateString.optional().nullable(),
  rateOverride: z.number().min(0).max(10000).optional().nullable(),
  allowedDays: z.array(z.number().int().min(0).max(6)).default([]),
  allowedTimeRanges: z.array(
    z.object({
      start: TimeString,
      end: TimeString,
    })
  ).default([]),
  active: z.boolean().optional().default(true),
});

export const UpdateAssignmentSchema = z.object({
  subject: z.string().trim().min(1).max(120).optional(),
  startDate: DateString.optional(),
  endDate: DateString.optional().nullable(),
  rateOverride: z.number().min(0).max(10000).optional().nullable(),
  allowedDays: z.array(z.number().int().min(0).max(6)).optional(),
  allowedTimeRanges: z.array(
    z.object({
      start: TimeString,
      end: TimeString,
    })
  ).optional(),
  active: z.boolean().optional(),
});

export const CreateSessionSchema = z.object({
  assignmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  date: DateString,
  startTime: TimeString,
  endTime: TimeString,
  mode: z.string().trim().min(1).max(40),
  location: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().max(120).optional(),
});

export const UpdateSessionSchema = z.object({
  date: DateString.optional(),
  startTime: TimeString.optional(),
  endTime: TimeString.optional(),
  mode: z.string().trim().min(1).max(40).optional(),
  location: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const RejectSessionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const PayrollGenerateSchema = z.object({
  weekStart: DateString,
});

export const AdjustmentCreateSchema = z.object({
  tutorId: z.string().uuid(),
  type: z.enum(['BONUS', 'CORRECTION', 'PENALTY']),
  amount: z.number().positive().max(1000000),
  reason: z.string().trim().min(1).max(2000),
  relatedSessionId: z.string().uuid().optional().nullable(),
});

export const DateRangeQuerySchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
});

export const AdminSessionsQuerySchema = DateRangeQuerySchema.extend({
  status: SessionStatusSchema.optional(),
  tutorId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['createdAt', 'date', 'tutor', 'student']).optional().default('date'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(25),
});

export const TutorSessionsQuerySchema = DateRangeQuerySchema.extend({
  status: SessionStatusSchema.optional(),
});

export const WeekStartParamSchema = z.object({
  weekStart: DateString,
});

export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export const DeleteAdjustmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const BulkApproveSessionsSchema = z.object({
  sessionIds: z.array(z.string().uuid()).min(1),
});

export const BulkRejectSessionsSchema = z.object({
  sessionIds: z.array(z.string().uuid()).min(1),
  reason: z.string().trim().max(500).optional(),
});

export const PrivacyRequestCreateSchema = z.object({
  requestType: z.enum(['ACCESS', 'CORRECTION', 'DELETION']),
  subjectType: z.enum(['TUTOR', 'STUDENT']),
  subjectId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const PrivacyRequestQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  subjectType: z.enum(['TUTOR', 'STUDENT']).optional(),
  subjectId: z.string().uuid().optional(),
});

export const PrivacyRequestCloseSchema = z.object({
  outcome: z.enum(['FULFILLED', 'REJECTED', 'ANONYMIZED', 'DELETED', 'CORRECTED']).optional(),
  note: z.string().trim().max(2000).optional(),
  correction: z.object({
    tutor: UpdateTutorSchema.optional(),
    student: UpdateStudentSchema.optional(),
  }).optional(),
});

export const ImpersonateStartSchema = z.object({
  tutorId: z.string().uuid(),
});

export const ImpersonateStopSchema = z.object({
  impersonationId: z.string().uuid().optional(),
});

export const AuditLogQuerySchema = DateRangeQuerySchema.extend({
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(25),
});

export const ArcadePlayerCreateSchema = z.object({
  nickname: z.string().trim().min(1).max(32).optional(),
});

export const ArcadeSessionStartSchema = z.object({
  playerId: z.string().uuid(),
  gameId: z.string().trim().min(1).max(80),
  gameTitle: z.string().trim().min(1).max(120).optional(),
  clientFingerprint: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(40).optional(),
});

export const ArcadeSessionEndSchema = z.object({
  sessionId: z.string().uuid(),
  endedAt: z.string().datetime().optional(),
  reason: z.string().trim().max(120).optional(),
});

export const ArcadeEventSchema = z.object({
  type: z.string().trim().min(1).max(80),
  payload: z.record(z.any()).optional().default({}),
  frame: z.number().int().min(0).max(1000000).optional().nullable(),
});

export const ArcadeScoreSchema = z.object({
  playerId: z.string().uuid(),
  gameId: z.string().trim().min(1).max(80),
  gameTitle: z.string().trim().min(1).max(120).optional(),
  sessionId: z.string().uuid(),
  sessionToken: z.string().trim().min(10).max(2048),
  score: z.number().int().min(0).max(100000000),
  telemetry: z.object({
    runSeed: z.string().trim().min(1).max(120).optional(),
    durationMs: z.number().int().min(0).max(10000000).optional(),
    eventCount: z.number().int().min(0).max(1000000).optional(),
    events: z.array(ArcadeEventSchema).optional(),
  }).optional(),
});

export const ArcadeLeaderboardParamSchema = z.object({
  game: z.string().trim().min(1).max(80),
});

export const ArcadeLeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const ArcadeBaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([
    'ad_impression',
    'ad_click',
    'reward_completed',
    'game_session_start',
    'game_session_end',
    'score_submitted',
    'score_validated',
  ]),
  occurredAt: z.string().datetime(),
  sessionId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  anonId: z.string().trim().min(1).max(120).optional().nullable(),
  source: z.string().trim().max(40).optional().nullable(),
  dedupeKey: z.string().trim().min(8).max(200),
  payload: z.record(z.any()).optional().default({}),
}).superRefine((val, ctx) => {
  if (!val.userId && !val.anonId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'user_id_or_anon_id_required' });
  }
});

export const ArcadeGameplayEventSchema = ArcadeBaseEventSchema;

export const ArcadeAdEventSchema = ArcadeBaseEventSchema.extend({
  placement: z.string().trim().min(1).max(80).optional().nullable(),
  provider: z.string().trim().min(1).max(80).optional().nullable(),
  creativeId: z.string().trim().min(1).max(120).optional().nullable(),
  variantId: z.string().trim().min(1).max(120).optional().nullable(),
});

export const ArcadeMatchEventSchema = z.object({
  gameId: z.string().trim().min(1).max(80),
  runSeed: z.string().trim().min(1).max(160),
  events: z.array(ArcadeEventSchema).min(1).max(5000),
});

export const ArcadeValidationSchema = z.object({
  gameId: z.string().trim().min(1).max(80),
  runSeed: z.string().trim().min(1).max(160),
  score: z.number().int().min(0).max(100000000),
  events: z.array(ArcadeEventSchema).min(1).max(5000),
});
