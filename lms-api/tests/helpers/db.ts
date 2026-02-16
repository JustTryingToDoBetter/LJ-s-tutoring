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
        if to_regclass('public.auth_event_log') is not null then execute 'delete from auth_event_log'; end if;
        if to_regclass('public.impersonation_sessions') is not null then execute 'delete from impersonation_sessions'; end if;
        if to_regclass('public.audit_log') is not null then execute 'delete from audit_log'; end if;
        if to_regclass('public.retention_events') is not null then execute 'delete from retention_events'; end if;
        if to_regclass('public.privacy_requests') is not null then execute 'delete from privacy_requests'; end if;
        if to_regclass('public.weekly_reports') is not null then execute 'delete from weekly_reports'; end if;
        if to_regclass('public.career_progress_snapshots') is not null then execute 'delete from career_progress_snapshots'; end if;
        if to_regclass('public.career_goal_selections') is not null then execute 'delete from career_goal_selections'; end if;
        if to_regclass('public.student_score_snapshots') is not null then execute 'delete from student_score_snapshots'; end if;
        if to_regclass('public.community_reports') is not null then execute 'delete from community_reports'; end if;
        if to_regclass('public.answers') is not null then execute 'delete from answers'; end if;
        if to_regclass('public.questions') is not null then execute 'delete from questions'; end if;
        if to_regclass('public.challenge_submissions') is not null then execute 'delete from challenge_submissions'; end if;
        if to_regclass('public.challenges') is not null then execute 'delete from challenges'; end if;
        if to_regclass('public.study_room_messages') is not null then execute 'delete from study_room_messages'; end if;
        if to_regclass('public.study_room_pinned_resources') is not null then execute 'delete from study_room_pinned_resources'; end if;
        if to_regclass('public.study_room_members') is not null then execute 'delete from study_room_members'; end if;
        if to_regclass('public.study_rooms') is not null then execute 'delete from study_rooms'; end if;
        if to_regclass('public.community_blocks') is not null then execute 'delete from community_blocks'; end if;
        if to_regclass('public.community_profiles') is not null then execute 'delete from community_profiles'; end if;
        if to_regclass('public.study_activity_events') is not null then execute 'delete from study_activity_events'; end if;
        if to_regclass('public.study_streaks') is not null then execute 'delete from study_streaks'; end if;
        if to_regclass('public.tutor_student_map') is not null then execute 'delete from tutor_student_map'; end if;
        if to_regclass('public.sessions') is not null then execute 'delete from sessions'; end if;
        if to_regclass('public.assignments') is not null then execute 'delete from assignments'; end if;
        if to_regclass('public.magic_link_tokens') is not null then execute 'delete from magic_link_tokens'; end if;
        if to_regclass('public.tutor_profiles') is not null then execute 'delete from tutor_profiles'; end if;
        if to_regclass('public.students') is not null then execute 'delete from students'; end if;
        if to_regclass('public.users') is not null then execute 'delete from users'; end if;

        if to_regclass('public.arcade_ad_events') is not null then execute 'delete from arcade_ad_events'; end if;
        if to_regclass('public.arcade_gameplay_events') is not null then execute 'delete from arcade_gameplay_events'; end if;
        if to_regclass('public.arcade_score_validations') is not null then execute 'delete from arcade_score_validations'; end if;
        if to_regclass('public.arcade_score_quarantine') is not null then execute 'delete from arcade_score_quarantine'; end if;
        if to_regclass('public.arcade_scores') is not null then execute 'delete from arcade_scores'; end if;
        if to_regclass('public.arcade_session_tokens') is not null then execute 'delete from arcade_session_tokens'; end if;
        if to_regclass('public.arcade_sessions') is not null then execute 'delete from arcade_sessions'; end if;
        if to_regclass('public.arcade_players') is not null then execute 'delete from arcade_players'; end if;
        if to_regclass('public.arcade_games') is not null then execute 'delete from arcade_games'; end if;
        if to_regclass('public.arcade_ad_blocklist') is not null then execute 'delete from arcade_ad_blocklist'; end if;
        if to_regclass('public.arcade_ad_providers') is not null then execute 'delete from arcade_ad_providers'; end if;
        if to_regclass('public.arcade_reconciliation_reports') is not null then execute 'delete from arcade_reconciliation_reports'; end if;
        if to_regclass('public.job_queue') is not null then execute 'delete from job_queue'; end if;

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
