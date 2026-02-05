import { pool } from '../../src/db/pool.js';

export async function resetDb() {
  await pool.query('begin');
  try {
    await pool.query(`
      do $$
      begin
        if to_regclass('public.invoice_lines') is not null then execute 'delete from invoice_lines'; end if;
        if to_regclass('public.invoices') is not null then execute 'delete from invoices'; end if;
        if to_regclass('public.adjustments') is not null then execute 'delete from adjustments'; end if;
        if to_regclass('public.pay_periods') is not null then execute 'delete from pay_periods'; end if;
        if to_regclass('public.session_history') is not null then execute 'delete from session_history'; end if;
        if to_regclass('public.audit_log') is not null then execute 'delete from audit_log'; end if;
        if to_regclass('public.privacy_requests') is not null then execute 'delete from privacy_requests'; end if;
        if to_regclass('public.sessions') is not null then execute 'delete from sessions'; end if;
        if to_regclass('public.assignments') is not null then execute 'delete from assignments'; end if;
        if to_regclass('public.magic_link_tokens') is not null then execute 'delete from magic_link_tokens'; end if;
        if to_regclass('public.tutor_profiles') is not null then execute 'delete from tutor_profiles'; end if;
        if to_regclass('public.students') is not null then execute 'delete from students'; end if;
        if to_regclass('public.users') is not null then execute 'delete from users'; end if;

        if to_regclass('public.tutoring_session_current') is not null then execute 'delete from tutoring_session_current'; end if;
        if to_regclass('public.tutoring_session_log') is not null then execute 'delete from tutoring_session_log'; end if;
        if to_regclass('public.tutoring_sessions') is not null then execute 'delete from tutoring_sessions'; end if;
        if to_regclass('public.tutor_student_assignments') is not null then execute 'delete from tutor_student_assignments'; end if;
        if to_regclass('public.tutors') is not null then execute 'delete from tutors'; end if;
      end $$;
    `);
    await pool.query('commit');
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
}
