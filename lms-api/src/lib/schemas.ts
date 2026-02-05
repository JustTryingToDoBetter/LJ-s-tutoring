import { z } from 'zod';

export const EmailSchema = z.string().email().transform((s) => s.trim().toLowerCase());

export const PasswordSchema = z
  .string()
  .min(10, 'password_too_short')
  .max(200, 'password_too_long');

export const RegisterAdminSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  bootstrapToken: z.string().min(1),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});

export const MagicLinkRequestSchema = z.object({
  email: EmailSchema,
});

export const CreateTutorSchema = z.object({
  email: EmailSchema,
  fullName: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  defaultHourlyRate: z.number().min(0).max(10000),
  active: z.boolean().optional().default(true),
});

export const UpdateTutorSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional().nullable(),
  defaultHourlyRate: z.number().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export const CreateStudentSchema = z.object({
  fullName: z.string().min(1).max(120),
  grade: z.string().max(20).optional(),
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  active: z.boolean().optional().default(true),
});

export const UpdateStudentSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  grade: z.string().max(20).optional().nullable(),
  guardianName: z.string().max(120).optional().nullable(),
  guardianPhone: z.string().max(40).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

export const AssignmentSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
  subject: z.string().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  rateOverride: z.number().min(0).max(10000).optional().nullable(),
  allowedDays: z.array(z.number().int().min(0).max(6)).default([]),
  allowedTimeRanges: z.array(
    z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).default([]),
  active: z.boolean().optional().default(true),
});

export const UpdateAssignmentSchema = z.object({
  subject: z.string().min(1).max(120).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  rateOverride: z.number().min(0).max(10000).optional().nullable(),
  allowedDays: z.array(z.number().int().min(0).max(6)).optional(),
  allowedTimeRanges: z.array(
    z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).optional(),
  active: z.boolean().optional(),
});

export const CreateSessionSchema = z.object({
  assignmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  mode: z.string().min(1).max(40),
  location: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mode: z.string().min(1).max(40).optional(),
  location: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const RejectSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const PayrollGenerateSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const AdjustmentCreateSchema = z.object({
  tutorId: z.string().uuid(),
  type: z.enum(['BONUS', 'CORRECTION', 'PENALTY']),
  amount: z.number().positive().max(1000000),
  reason: z.string().min(1).max(2000),
  relatedSessionId: z.string().uuid().optional().nullable(),
});
