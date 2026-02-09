import { getPayPeriodStart } from '../../../lib/pay-periods.js';
import type { DbClient } from '../shared/types.js';

const fieldLabels: Record<string, string> = {
  date: 'Date',
  start_time: 'Start time',
  end_time: 'End time',
  duration_minutes: 'Duration',
  status: 'Status',
  mode: 'Mode',
  location: 'Location',
  notes: 'Notes',
  assignment_id: 'Assignment',
  tutor_id: 'Tutor',
  student_id: 'Student',
  approved_by: 'Approved by',
  approved_at: 'Approved at',
  submitted_at: 'Submitted at',
  created_at: 'Created at',
  reject_reason: 'Reject reason'
};

const importantFields = new Set([
  'status',
  'date',
  'start_time',
  'end_time',
  'assignment_id',
  'student_id',
  'tutor_id',
  'approved_by'
]);

const orderedFields = [
  'status',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'assignment_id',
  'student_id',
  'tutor_id',
  'mode',
  'location',
  'notes',
  'approved_by',
  'approved_at',
  'submitted_at',
  'created_at',
  'reject_reason'
];

export function normalizeJson(value: any) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function stableStringify(value: any): string {
  if (value === undefined) return 'null';
  if (value == null) return '';
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableStringify(item) || 'null')));
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const normalized: Record<string, any> = {};
    for (const key of keys) {
      normalized[key] = JSON.parse(stableStringify(value[key]) || 'null');
    }
    return JSON.stringify(normalized);
  }
  return JSON.stringify(value);
}

function normalizeDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
  }
  return value;
}

function normalizeTimeValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  if (typeof value === 'string') {
    const match = value.match(/^(\d{2}:\d{2})/);
    if (match) return match[1];
  }
  return value;
}

function normalizeComparable(field: string, value: any) {
  if (value == null) return null;
  if (field === 'date' || field.endsWith('_date')) return normalizeDateValue(value);
  if (field === 'start_time' || field === 'end_time') return normalizeTimeValue(value);
  if (field.endsWith('_at')) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
  }
  if (typeof value === 'number') return Number(value);
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) || typeof value === 'object') return stableStringify(value);
  return value;
}

function summarizeComplex(value: any) {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    if (value.length <= 3) return JSON.stringify(value);
    return `${value.length} items`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const preview = keys.slice(0, 3).join(', ');
    const more = keys.length > 3 ? ` (+${keys.length - 3})` : '';
    return `Keys: ${preview}${more}`;
  }
  return String(value);
}

function formatDisplay(field: string, value: any) {
  if (value == null || value === '') return '—';
  if (field === 'date' || field.endsWith('_date')) return String(normalizeDateValue(value));
  if (field === 'start_time' || field === 'end_time') return String(normalizeTimeValue(value));
  if (field === 'duration_minutes') return `${Number(value)} min`;
  if (Array.isArray(value) || typeof value === 'object') return summarizeComplex(value);
  return String(value);
}

function toLabel(field: string) {
  if (fieldLabels[field]) return fieldLabels[field];
  return field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function computeDiffs(beforeRaw: any, afterRaw: any) {
  const before = normalizeJson(beforeRaw) ?? {};
  const after = normalizeJson(afterRaw) ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const known = orderedFields.filter((key) => keys.has(key));
  const rest = Array.from(keys)
    .filter((key) => !orderedFields.includes(key))
    .sort();

  const diffs = [] as Array<{
    field: string;
    label: string;
    before: string;
    after: string;
    important: boolean;
  }>;

  for (const field of [...known, ...rest]) {
    const beforeValue = (before as any)[field];
    const afterValue = (after as any)[field];
    const normBefore = normalizeComparable(field, beforeValue);
    const normAfter = normalizeComparable(field, afterValue);
    if (normBefore === normAfter) continue;

    diffs.push({
      field,
      label: toLabel(field),
      before: formatDisplay(field, beforeValue),
      after: formatDisplay(field, afterValue),
      important: importantFields.has(field)
    });
  }

  return diffs;
}

export async function isDateLocked(client: DbClient, dateValue: Date) {
  const weekStart = getPayPeriodStart(dateValue.toISOString().slice(0, 10));
  const res = await client.query(
    `select status from pay_periods where period_start_date = $1::date`,
    [weekStart]
  );
  return res.rowCount > 0 && res.rows[0].status === 'LOCKED';
}
