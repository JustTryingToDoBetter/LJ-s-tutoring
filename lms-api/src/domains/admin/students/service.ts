import type { DbClient } from '../shared/types.js';
import type { CreateStudentInput, UpdateStudentInput, StudentSummary } from './contracts.js';
import { parsePagination } from '../../../lib/pagination.js';

export async function createStudent(client: DbClient, input: CreateStudentInput) {
  const res = await client.query(
    `insert into students (full_name, grade, guardian_name, guardian_phone, notes, is_active)
     values ($1, $2, $3, $4, $5, $6)
     returning id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active`,
    [
      input.fullName,
      input.grade ?? null,
      input.guardianName ?? null,
      input.guardianPhone ?? null,
      input.notes ?? null,
      input.active
    ]
  );

  return res.rows[0];
}

export async function listStudents(
  client: DbClient,
  query: { page?: unknown; pageSize?: unknown; q?: string } = {}
): Promise<{ students: StudentSummary[]; items: StudentSummary[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const q = query.q?.trim();
  const filters: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    filters.push(`(full_name ilike $${params.length} or guardian_name ilike $${params.length})`);
  }

  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  const res = await client.query(
    `select id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active
     from students
     ${where}
     order by full_name asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  );

  const totalRes = await client.query(
    `select count(*)
     from students
     ${where}`,
    params
  );

  const total = Number(totalRes.rows[0]?.count || 0);
  return { students: res.rows, items: res.rows, total, page, pageSize };
}

export async function updateStudent(client: DbClient, studentId: string, input: UpdateStudentInput) {
  const currentRes = await client.query(`select * from students where id = $1`, [studentId]);
  if (currentRes.rowCount === 0) return null;
  const current = currentRes.rows[0];

  const res = await client.query(
    `update students
     set full_name = $1,
         grade = $2,
         guardian_name = $3,
         guardian_phone = $4,
         notes = $5,
         is_active = $6
     where id = $7
     returning id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active`,
    [
      input.fullName ?? current.full_name,
      input.grade ?? current.grade,
      input.guardianName ?? current.guardian_name,
      input.guardianPhone ?? current.guardian_phone,
      input.notes ?? current.notes,
      input.active ?? current.is_active,
      studentId
    ]
  );

  return res.rows[0];
}
