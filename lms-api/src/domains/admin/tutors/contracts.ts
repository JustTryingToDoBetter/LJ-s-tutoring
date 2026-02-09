import type { z } from 'zod';
import {
  CreateTutorSchema,
  UpdateTutorSchema,
  ImpersonateStartSchema,
  ImpersonateStopSchema
} from '../../../lib/schemas.js';

export type CreateTutorInput = z.infer<typeof CreateTutorSchema>;
export type UpdateTutorInput = z.infer<typeof UpdateTutorSchema>;
export type ImpersonateStartInput = z.infer<typeof ImpersonateStartSchema>;
export type ImpersonateStopInput = z.infer<typeof ImpersonateStopSchema>;

export type TutorSummary = {
  id: string;
  full_name: string;
  phone: string | null;
  default_hourly_rate: number;
  active: boolean;
  status?: string;
  qualification_band?: string | null;
  qualified_subjects_json?: unknown;
  email?: string | null;
};

export type TutorUser = {
  id: string;
  email: string;
  role: string;
  tutor_profile_id: string | null;
};

export type ImpersonationStartResult = {
  impersonationId: string;
  token: string;
  tutor: {
    id: string;
    name: string;
    email: string;
  };
};
