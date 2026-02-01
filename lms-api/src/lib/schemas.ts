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

export const CreateTutorSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(40).optional(),
});

export const CreateStudentSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  grade: z.string().max(20).optional(),
});


export const CreateSessionSchema = z.object({
  studentId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().max(2000).optional().default(''),
});


export const AssignmentSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
  validFrom: z.string().datetime().optional(), // default server-side to now()
  validTo: z.string().datetime().optional().nullable(),
});

export const AmendSessionSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().max(2000).optional().default(''),
});

export const VoidSessionSchema = z.object({
  reason: z.string().max(500).optional().default(''),
});
