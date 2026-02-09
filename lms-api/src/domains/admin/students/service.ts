import type { DbClient } from '../shared/types.js';
import type { CreateStudentInput, UpdateStudentInput, StudentSummary } from './contracts.js';

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

export async function listStudents(client: DbClient): Promise<{ students: StudentSummary[] }> {
  const res = await client.query(
    `select id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active
     from students
     order by full_name asc`
  );
  return { students: res.rows };
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
