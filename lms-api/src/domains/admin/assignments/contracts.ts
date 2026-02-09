import type { z } from 'zod';
import { AssignmentSchema, UpdateAssignmentSchema } from '../../../lib/schemas.js';

export type CreateAssignmentInput = z.infer<typeof AssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentSchema>;

export type AssignmentSummary = {
  id: string;
  tutor_id: string;
  student_id: string;
  subject: string;
  start_date: string;
  end_date: string | null;
  rate_override: number | null;
  allowed_days_json: unknown;
  allowed_time_ranges_json: unknown;
  active: boolean;
  tutor_name?: string;
  student_name?: string;
};
