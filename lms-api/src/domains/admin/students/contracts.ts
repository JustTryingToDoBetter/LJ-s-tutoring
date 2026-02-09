import type { z } from 'zod';
import { CreateStudentSchema, UpdateStudentSchema } from '../../../lib/schemas.js';

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

export type StudentSummary = {
  id: string;
  full_name: string;
  grade: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  active: boolean;
};
