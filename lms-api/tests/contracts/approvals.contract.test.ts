import { describe, expect, it } from 'vitest';
import {
  AdminSessionsQuerySchema,
  BulkApproveSessionsSchema,
  BulkRejectSessionsSchema,
  RejectSessionSchema
} from '../../src/lib/schemas.js';

const validUuid = '11111111-1111-1111-1111-111111111111';

describe('approvals contracts', () => {
  it('accepts admin sessions query params', () => {
    const parsed = AdminSessionsQuerySchema.safeParse({
      status: 'SUBMITTED',
      from: '2024-01-01',
      to: '2024-01-31',
      tutorId: validUuid,
      studentId: validUuid,
      q: 'algebra',
      sort: 'date',
      order: 'desc',
      page: '2',
      pageSize: '50'
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid admin sessions query params', () => {
    const parsed = AdminSessionsQuerySchema.safeParse({
      status: 'UNKNOWN',
      page: 0,
      pageSize: 999
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts bulk approve payload', () => {
    const parsed = BulkApproveSessionsSchema.safeParse({
      sessionIds: [validUuid]
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts bulk reject payload with reason', () => {
    const parsed = BulkRejectSessionsSchema.safeParse({
      sessionIds: [validUuid],
      reason: 'Needs correction'
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts reject payload', () => {
    const parsed = RejectSessionSchema.safeParse({
      reason: 'Missing notes'
    });
    expect(parsed.success).toBe(true);
  });
});
