import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeString = z.string().regex(/^\d{2}:\d{2}$/);
const SessionStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']);

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
});

export const UpdateTutorSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  defaultHourlyRate: z.number().min(0).max(10000).optional(),
  active: z.boolean().optional(),
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
