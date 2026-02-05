const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getPayPeriodStart(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(value);
  const day = date.getUTCDay();
  const offset = (day + 6) % 7;
  const start = new Date(date.getTime() - offset * MS_PER_DAY);
  return toIsoDate(start);
}

export function getPayPeriodRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}
