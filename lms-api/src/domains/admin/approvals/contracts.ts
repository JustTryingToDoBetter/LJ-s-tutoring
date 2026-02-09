import type { z } from 'zod';
import {
  AdminSessionsQuerySchema,
  BulkApproveSessionsSchema,
  BulkRejectSessionsSchema,
  RejectSessionSchema
} from '../../../lib/schemas.js';

export type AdminSessionsQuery = z.infer<typeof AdminSessionsQuerySchema>;
export type BulkApproveInput = z.infer<typeof BulkApproveSessionsSchema>;
export type BulkRejectInput = z.infer<typeof BulkRejectSessionsSchema>;
export type RejectInput = z.infer<typeof RejectSessionSchema>;

export type SessionHistoryEntry = {
  id: string;
  changeType: string;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    role: string;
    name?: string;
  } | null;
  beforeJson: unknown;
  afterJson: unknown;
  diffs: Array<{
    field: string;
    label: string;
    before: string;
    after: string;
    important: boolean;
  }>;
};
