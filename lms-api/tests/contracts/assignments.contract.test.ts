import { describe, expect, it } from 'vitest';
import { AssignmentSchema, UpdateAssignmentSchema } from '../../src/lib/schemas.js';

const validUuid = '11111111-1111-1111-1111-111111111111';

describe('assignment contracts', () => {
  it('accepts valid assignment creation payload', () => {
    const parsed = AssignmentSchema.safeParse({
      tutorId: validUuid,
      studentId: validUuid,
      subject: 'Math',
      startDate: '2026-02-01',
      endDate: '2026-03-01',
      rateOverride: 300,
      allowedDays: [1, 2, 3],
      allowedTimeRanges: [{ start: '08:00', end: '17:00' }],
      active: true
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid assignment payload', () => {
    const parsed = AssignmentSchema.safeParse({
      tutorId: 'bad',
      studentId: 'bad',
      subject: '',
      startDate: '01-01-2026'
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts assignment update payload', () => {
    const parsed = UpdateAssignmentSchema.safeParse({
      subject: 'Updated Subject',
      active: false
    });
    expect(parsed.success).toBe(true);
  });
});
