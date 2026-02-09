import { describe, expect, it } from 'vitest';
import {
  PayrollGenerateSchema,
  AdjustmentCreateSchema,
  DeleteAdjustmentSchema
} from '../../src/lib/schemas.js';

const validUuid = '11111111-1111-1111-1111-111111111111';

describe('payroll contracts', () => {
  it('accepts payroll generate payload', () => {
    const parsed = PayrollGenerateSchema.safeParse({
      weekStart: '2024-02-12'
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects payroll generate payload with invalid date', () => {
    const parsed = PayrollGenerateSchema.safeParse({
      weekStart: 'not-a-date'
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts adjustment create payload', () => {
    const parsed = AdjustmentCreateSchema.safeParse({
      tutorId: validUuid,
      type: 'BONUS',
      amount: 250,
      reason: 'Great work',
      relatedSessionId: null
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid adjustment create payload', () => {
    const parsed = AdjustmentCreateSchema.safeParse({
      tutorId: 'not-a-uuid',
      type: 'BONUS',
      amount: -10,
      reason: ''
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts adjustment delete payload', () => {
    const parsed = DeleteAdjustmentSchema.safeParse({
      reason: 'entered in error'
    });
    expect(parsed.success).toBe(true);
  });
});
