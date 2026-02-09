import type { z } from 'zod';
import {
  PayrollGenerateSchema,
  WeekStartParamSchema,
  AdjustmentCreateSchema,
  DeleteAdjustmentSchema
} from '../../../lib/schemas.js';

export type PayrollGenerateInput = z.infer<typeof PayrollGenerateSchema>;
export type WeekStartParam = z.infer<typeof WeekStartParamSchema>;
export type AdjustmentCreateInput = z.infer<typeof AdjustmentCreateSchema>;
export type DeleteAdjustmentInput = z.infer<typeof DeleteAdjustmentSchema>;
