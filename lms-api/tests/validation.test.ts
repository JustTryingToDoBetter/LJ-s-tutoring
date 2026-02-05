import { describe, it, expect } from 'vitest';
import { durationMinutes, isWithinAssignmentWindow } from '../src/lib/scheduling.js';

describe('Scheduling validation', () => {
  it('validates allowed day and time ranges', () => {
    const ok = isWithinAssignmentWindow('2026-02-02', '16:00', '17:00', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1, 3],
      allowedTimeRanges: [{ start: '15:00', end: '18:00' }]
    });

    const badDay = isWithinAssignmentWindow('2026-02-03', '16:00', '17:00', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1],
      allowedTimeRanges: [{ start: '15:00', end: '18:00' }]
    });

    const badTime = isWithinAssignmentWindow('2026-02-02', '18:30', '19:30', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1],
      allowedTimeRanges: [{ start: '15:00', end: '18:00' }]
    });

    expect(ok).toBe(true);
    expect(badDay).toBe(false);
    expect(badTime).toBe(false);
  });

  it('computes duration minutes', () => {
    expect(durationMinutes('09:00', '10:15')).toBe(75);
    expect(durationMinutes('14:30', '15:00')).toBe(30);
  });
});
