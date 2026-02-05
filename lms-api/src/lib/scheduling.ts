type TimeRange = { start: string; end: string };

type AssignmentWindow = {
  allowedDays: number[];
  allowedTimeRanges: TimeRange[];
  startDate: string;
  endDate?: string | null;
};

export function parseTimeToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinAssignmentWindow(
  date: string,
  startTime: string,
  endTime: string,
  window: AssignmentWindow
) {
  const sessionDate = new Date(date + 'T00:00:00Z');
  const day = sessionDate.getUTCDay();
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (end <= start) return false;

  const startDate = new Date(window.startDate + 'T00:00:00Z');
  const endDate = window.endDate ? new Date(window.endDate + 'T00:00:00Z') : null;

  if (sessionDate < startDate) return false;
  if (endDate && sessionDate > endDate) return false;

  if (window.allowedDays.length > 0 && !window.allowedDays.includes(day)) {
    return false;
  }

  if (window.allowedTimeRanges.length > 0) {
    const inRange = window.allowedTimeRanges.some((range) => {
      const rangeStart = parseTimeToMinutes(range.start);
      const rangeEnd = parseTimeToMinutes(range.end);
      return start >= rangeStart && end <= rangeEnd;
    });

    if (!inRange) return false;
  }

  return true;
}

export function durationMinutes(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  return end - start;
}
