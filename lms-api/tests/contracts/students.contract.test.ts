import { describe, expect, it } from 'vitest';
import { CreateStudentSchema, UpdateStudentSchema } from '../../src/lib/schemas.js';

describe('student contracts', () => {
  it('accepts valid student creation payload', () => {
    const parsed = CreateStudentSchema.safeParse({
      fullName: 'Student Example',
      grade: '10',
      guardianName: 'Guardian Example',
      guardianPhone: '0790000000',
      notes: 'Needs extra support',
      active: true
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid student creation payload', () => {
    const parsed = CreateStudentSchema.safeParse({
      fullName: '',
      grade: 'x'.repeat(40)
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts student update payload', () => {
    const parsed = UpdateStudentSchema.safeParse({
      fullName: 'Updated Student',
      active: false
    });
    expect(parsed.success).toBe(true);
  });
});
