import { describe, it, expect } from 'vitest';
import { getPayPeriodRange, getPayPeriodStart } from '../src/lib/pay-periods.js';

describe('pay period helpers', () => {
  it('returns Monday as the start of week', () => {
    expect(getPayPeriodStart('2026-02-02')).toBe('2026-02-02');
    expect(getPayPeriodStart('2026-02-08')).toBe('2026-02-02');
    expect(getPayPeriodStart('2026-02-04')).toBe('2026-02-02');
  });

  it('returns a full Monday-Sunday range', () => {
    const range = getPayPeriodRange('2026-02-02');
    expect(range.start).toBe('2026-02-02');
    expect(range.end).toBe('2026-02-08');
  });
});
