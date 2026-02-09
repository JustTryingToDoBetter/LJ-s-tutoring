import type { DbClient } from '../shared/types.js';
import type { CreateAssignmentInput, UpdateAssignmentInput, AssignmentSummary } from './contracts.js';
import { parsePagination } from '../../../lib/pagination.js';
import {
  parseGrade,
  getGradeBand,
  isSubjectAllowedForGrade,
  isTutorQualifiedForGradeBand,
  isTutorQualifiedForSubject
} from '../../../lib/caps.js';

export async function createAssignment(client: DbClient, input: CreateAssignmentInput) {
  const [tutorRes, studentRes] = await Promise.all([
    client.query(
      `select id, active, status, qualification_band, qualified_subjects_json
       from tutor_profiles where id = $1`,
      [input.tutorId]
    ),
    client.query(`select id, grade from students where id = $1`, [input.studentId])
  ]);

  if (tutorRes.rowCount === 0) return { error: 'tutor_not_found' } as const;
  if (studentRes.rowCount === 0) return { error: 'student_not_found' } as const;

  const tutor = tutorRes.rows[0];
  if (!tutor.active || tutor.status !== 'ACTIVE') return { error: 'tutor_not_active' } as const;
  const grade = parseGrade(studentRes.rows[0]?.grade);
  if (!grade) return { error: 'student_grade_missing' } as const;

  const gradeBand = getGradeBand(grade);
  if (!gradeBand) return { error: 'student_grade_invalid' } as const;
  if (!isSubjectAllowedForGrade(input.subject, grade)) {
    return { error: 'subject_grade_invalid' } as const;
  }

  const tutorBand = tutor.qualification_band as string | null;
  const tutorSubjects = Array.isArray(tutor.qualified_subjects_json) ? tutor.qualified_subjects_json : [];
  if (!tutorBand) return { error: 'tutor_not_qualified' } as const;
  if (!isTutorQualifiedForGradeBand(tutorBand as any, gradeBand)) {
    return { error: 'tutor_not_qualified' } as const;
  }
  if (!isTutorQualifiedForSubject(input.subject, tutorSubjects as string[])) {
    return { error: 'tutor_not_qualified' } as const;
  }

  const res = await client.query(
    `insert into assignments
     (tutor_id, student_id, subject, start_date, end_date, rate_override, allowed_days_json, allowed_time_ranges_json, active)
     values ($1, $2, $3, $4::date, $5::date, $6, $7::jsonb, $8::jsonb, $9)
     returning *`,
    [
      input.tutorId,
      input.studentId,
      input.subject,
      input.startDate,
      input.endDate ?? null,
      input.rateOverride ?? null,
      JSON.stringify(input.allowedDays),
      JSON.stringify(input.allowedTimeRanges),
      input.active
    ]
  );

  return { assignment: res.rows[0] } as const;
}

export async function listAssignments(
  client: DbClient,
  query: { page?: unknown; pageSize?: unknown; q?: string } = {}
): Promise<{ assignments: AssignmentSummary[]; items: AssignmentSummary[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const q = query.q?.trim();
  const filters: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    filters.push(`(a.subject ilike $${params.length} or t.full_name ilike $${params.length} or s.full_name ilike $${params.length})`);
  }

  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  const res = await client.query(
    `select a.*, t.full_name as tutor_name, s.full_name as student_name
     from assignments a
     join tutor_profiles t on t.id = a.tutor_id
     join students s on s.id = a.student_id
     ${where}
     order by a.start_date desc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  );

  const totalRes = await client.query(
    `select count(*)
     from assignments a
     join tutor_profiles t on t.id = a.tutor_id
     join students s on s.id = a.student_id
     ${where}`,
    params
  );

  const total = Number(totalRes.rows[0]?.count || 0);
  return { assignments: res.rows, items: res.rows, total, page, pageSize };
}

function normalizeJson(value: any) {
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

export async function updateAssignment(client: DbClient, assignmentId: string, input: UpdateAssignmentInput) {
  const currentRes = await client.query(`select * from assignments where id = $1`, [assignmentId]);
  if (currentRes.rowCount === 0) return null;
  const current = currentRes.rows[0];

  const [tutorRes, studentRes] = await Promise.all([
    client.query(
      `select id, active, status, qualification_band, qualified_subjects_json
       from tutor_profiles where id = $1`,
      [current.tutor_id]
    ),
    client.query(`select id, grade from students where id = $1`, [current.student_id])
  ]);

  if (tutorRes.rowCount === 0) return { error: 'tutor_not_found' } as const;
  if (studentRes.rowCount === 0) return { error: 'student_not_found' } as const;

  const tutor = tutorRes.rows[0];
  if (!tutor.active || tutor.status !== 'ACTIVE') return { error: 'tutor_not_active' } as const;

  const grade = parseGrade(studentRes.rows[0]?.grade);
  if (!grade) return { error: 'student_grade_missing' } as const;
  const gradeBand = getGradeBand(grade);
  if (!gradeBand) return { error: 'student_grade_invalid' } as const;

  const subject = input.subject ?? current.subject;
  if (!isSubjectAllowedForGrade(subject, grade)) {
    return { error: 'subject_grade_invalid' } as const;
  }

  const tutorBand = tutor.qualification_band as string | null;
  const tutorSubjects = Array.isArray(tutor.qualified_subjects_json) ? tutor.qualified_subjects_json : [];
  if (!tutorBand) return { error: 'tutor_not_qualified' } as const;
  if (!isTutorQualifiedForGradeBand(tutorBand as any, gradeBand)) {
    return { error: 'tutor_not_qualified' } as const;
  }
  if (!isTutorQualifiedForSubject(subject, tutorSubjects as string[])) {
    return { error: 'tutor_not_qualified' } as const;
  }

  const res = await client.query(
    `update assignments
     set subject = $1,
         start_date = $2::date,
         end_date = $3::date,
         rate_override = $4,
         allowed_days_json = $5::jsonb,
         allowed_time_ranges_json = $6::jsonb,
         active = $7
     where id = $8
     returning *`,
    [
      input.subject ?? current.subject,
      input.startDate ?? current.start_date,
      input.endDate ?? current.end_date,
      input.rateOverride ?? current.rate_override,
      input.allowedDays ? JSON.stringify(input.allowedDays) : normalizeJson(current.allowed_days_json),
      input.allowedTimeRanges ? JSON.stringify(input.allowedTimeRanges) : normalizeJson(current.allowed_time_ranges_json),
      input.active ?? current.active,
      assignmentId
    ]
  );

  return res.rows[0];
}
