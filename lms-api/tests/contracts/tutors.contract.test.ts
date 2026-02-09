import { describe, expect, it } from 'vitest';
import {
  CreateTutorSchema,
  UpdateTutorSchema,
  ImpersonateStartSchema,
  ImpersonateStopSchema
} from '../../src/lib/schemas.js';

const validUuid = '11111111-1111-1111-1111-111111111111';

describe('tutor contracts', () => {
  it('accepts valid tutor creation payload', () => {
    const parsed = CreateTutorSchema.safeParse({
      email: 'tutor@example.com',
      fullName: 'Tutor Example',
      phone: '0712345678',
      defaultHourlyRate: 250,
      active: true
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid tutor creation payload', () => {
    const parsed = CreateTutorSchema.safeParse({
      email: 'not-an-email',
      fullName: '',
      defaultHourlyRate: -1,
      active: true
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts tutor update payload', () => {
    const parsed = UpdateTutorSchema.safeParse({
      fullName: 'Updated Tutor',
      active: false
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts impersonation start payload', () => {
    const parsed = ImpersonateStartSchema.safeParse({ tutorId: validUuid });
    expect(parsed.success).toBe(true);
  });

  it('accepts impersonation stop payload', () => {
    const parsed = ImpersonateStopSchema.safeParse({ impersonationId: validUuid });
    expect(parsed.success).toBe(true);
  });
});
