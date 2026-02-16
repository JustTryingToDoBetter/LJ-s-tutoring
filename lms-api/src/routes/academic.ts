import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole, requireTutor } from '../lib/rbac.js';
import {
  IdParamSchema,
  StudyActivityEventSchema,
  WeeklyReportGenerateSchema,
  WeeklyReportsQuerySchema
} from '../lib/schemas.js';
import { parsePagination } from '../lib/pagination.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_DAILY_XP = 10;
const WEEK_BONUS_XP = 20;

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getWeekRange(from = new Date()) {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const weekday = base.getUTCDay();
  const distanceToMonday = (weekday + 6) % 7;
  const weekStart = new Date(base.getTime() - distanceToMonday * DAY_MS);
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
  return {
    weekStart: toDateOnly(weekStart),
    weekEnd: toDateOnly(weekEnd),
  };
}

function normalizeJson(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function setPrivateNoStore(reply: any) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function logEvent(req: FastifyRequest, event: string, payload: Record<string, unknown>) {
  req.log?.info?.({
    event,
    requestId: req.id,
    role: req.user?.role,
    userId: req.user?.userId,
    ...payload,
  }, 'analytics.event');
}

async function getStudentIdForUser(userId: string) {
  const res = await pool.query(
    `select student_id from users where id = $1`,
    [userId]
  );
  return (res.rows[0]?.student_id as string | null) ?? null;
}

async function userCanAccessStudent(userId: string, role: 'ADMIN' | 'TUTOR' | 'STUDENT', studentId: string, tutorId?: string) {
  if (role === 'ADMIN') return true;
  if (role === 'STUDENT') {
    const own = await getStudentIdForUser(userId);
    return own === studentId;
  }
  if (role === 'TUTOR' && tutorId) {
    const res = await pool.query(
      `select 1
       from tutor_student_map
       where tutor_id = $1 and student_id = $2
       limit 1`,
      [tutorId, studentId]
    );
    if (Number(res.rowCount || 0) > 0) return true;

    const fallback = await pool.query(
      `select 1
       from assignments
       where tutor_id = $1 and student_id = $2 and active = true
       limit 1`,
      [tutorId, studentId]
    );
    return Number(fallback.rowCount || 0) > 0;
  }
  return false;
}

async function ensureStreakRow(client: any, userId: string) {
  await client.query(
    `insert into study_streaks (user_id, current, longest, xp)
     values ($1, 0, 0, 0)
     on conflict (user_id) do nothing`,
    [userId]
  );
}

async function buildWeeklyReportPayload(studentId: string, weekStart: string, weekEnd: string) {
  const metaRes = await pool.query(
    `select s.id, s.full_name, s.grade, u.id as user_id
     from students s
     left join users u on u.student_id = s.id
     where s.id = $1`,
    [studentId]
  );
  if (metaRes.rowCount === 0) return null;
  const studentMeta = metaRes.rows[0] as {
    id: string;
    full_name: string;
    grade: string | null;
    user_id: string | null;
  };

  const sessionsRes = await pool.query(
    `select
        count(*) filter (where status = 'APPROVED')::int as attended,
        coalesce(sum(duration_minutes) filter (where status = 'APPROVED'), 0)::int as minutes,
        coalesce(string_agg(left(coalesce(notes, ''), 120), '\n' order by date desc), '') as notes
     from sessions
     where student_id = $1
       and date >= $2::date
       and date <= $3::date`,
    [studentId, weekStart, weekEnd]
  );

  const subjectRes = await pool.query(
    `select a.subject,
            count(s.id)::int as sessions,
            coalesce(sum(s.duration_minutes), 0)::int as minutes
     from assignments a
     left join sessions s
       on s.assignment_id = a.id
      and s.status = 'APPROVED'
      and s.date >= $2::date
      and s.date <= $3::date
     where a.student_id = $1
     group by a.subject
     order by a.subject asc`,
    [studentId, weekStart, weekEnd]
  );

  let streakSummary = { current: 0, longest: 0, xp: 0 };
  if (studentMeta.user_id) {
    const streakRes = await pool.query(
      `select current, longest, xp
       from study_streaks
       where user_id = $1`,
      [studentMeta.user_id]
    );
    if (Number(streakRes.rowCount || 0) > 0) {
      streakSummary = {
        current: Number(streakRes.rows[0].current || 0),
        longest: Number(streakRes.rows[0].longest || 0),
        xp: Number(streakRes.rows[0].xp || 0),
      };
    }
  }

  const attended = Number(sessionsRes.rows[0]?.attended || 0);
  const minutesStudied = Number(sessionsRes.rows[0]?.minutes || 0);
  const notesRaw = String(sessionsRes.rows[0]?.notes || '');
  const notesSummary = notesRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  const topicProgress = subjectRes.rows.map((row) => {
    const sessions = Number(row.sessions || 0);
    const minutes = Number(row.minutes || 0);
    const completion = Math.max(0, Math.min(100, Math.round((minutes / 180) * 100)));
    return {
      topic: String(row.subject),
      sessions,
      minutes,
      completion,
    };
  });

  const weakest = [...topicProgress].sort((a, b) => a.completion - b.completion)[0];

  return {
    student: {
      id: studentMeta.id,
      name: studentMeta.full_name,
      grade: studentMeta.grade,
    },
    week: {
      start: weekStart,
      end: weekEnd,
    },
    metrics: {
      sessionsAttended: attended,
      timeStudiedMinutes: minutesStudied,
      streak: streakSummary.current,
      longestStreak: streakSummary.longest,
      xp: streakSummary.xp,
    },
    topicProgress,
    tutorNotesSummary: notesSummary,
    goalsNextWeek: weakest
      ? [`Lift ${weakest.topic} to at least ${Math.min(100, weakest.completion + 15)}% mastery.`]
      : ['Complete at least one focused practice session.'],
  };
}

export async function academicRoutes(app: FastifyInstance) {
  app.get('/dashboard', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    logEvent(req, 'dashboard_viewed', { role: 'student' });

    const userId = req.user!.userId;
    const studentId = req.user?.studentId ?? await getStudentIdForUser(userId);
    if (!studentId) return reply.code(404).send({ error: 'student_not_found' });

    const now = new Date();
    const today = toDateOnly(now);
    const { weekStart, weekEnd } = getWeekRange(now);

    const upcomingRes = await pool.query(
      `select s.id, s.date, s.start_time, s.mode, s.location, a.subject
       from sessions s
       join assignments a on a.id = s.assignment_id
       where s.student_id = $1
         and s.date >= $2::date
         and s.status in ('DRAFT', 'SUBMITTED', 'APPROVED')
       order by s.date asc, s.start_time asc
       limit 1`,
      [studentId, today]
    );

    const streakRes = await pool.query(
      `select current, longest, last_credited_date, xp
       from study_streaks
       where user_id = $1`,
      [userId]
    );

    const weekStatsRes = await pool.query(
      `select
          count(*) filter (where sae.type = 'session_attended')::int as sessions_attended,
          coalesce(sum((sae.metadata_json ->> 'durationMinutes')::int), 0)::int as minutes_studied
       from study_activity_events sae
       where sae.user_id = $1
         and sae.occurred_at >= $2::date
         and sae.occurred_at < ($3::date + interval '1 day')`,
      [userId, weekStart, weekEnd]
    );

    const topicRes = await pool.query(
      `select a.subject,
              count(s.id)::int as sessions,
              coalesce(sum(s.duration_minutes), 0)::int as minutes
       from assignments a
       left join sessions s
         on s.assignment_id = a.id
        and s.student_id = a.student_id
        and s.status = 'APPROVED'
       where a.student_id = $1
       group by a.subject
       order by a.subject asc`,
      [studentId]
    );

    const topics = topicRes.rows.map((row) => {
      const sessions = Number(row.sessions || 0);
      const minutes = Number(row.minutes || 0);
      return {
        topic: row.subject,
        sessions,
        minutes,
        completion: Math.max(0, Math.min(100, Math.round((minutes / 240) * 100))),
      };
    });

    const weakestTopic = [...topics].sort((a, b) => a.completion - b.completion)[0] ?? null;
    const weekStats = weekStatsRes.rows[0] ?? { sessions_attended: 0, minutes_studied: 0 };
    const streak = streakRes.rows[0] ?? { current: 0, longest: 0, last_credited_date: null, xp: 0 };

    const scoreRes = await pool.query(
      `select score_date, risk_score, momentum_score, reasons_json, recommended_actions_json
       from student_score_snapshots
       where user_id = $1
       order by score_date desc
       limit 1`,
      [userId]
    );

    const careerRes = await pool.query(
      `select cgs.goal_id, cps.alignment_score
       from career_goal_selections cgs
       left join lateral (
         select alignment_score
         from career_progress_snapshots cps
         where cps.user_id = cgs.user_id
           and cps.goal_id = cgs.goal_id
         order by cps.created_at desc
         limit 1
       ) cps on true
       where cgs.user_id = $1
       order by cgs.created_at asc
       limit 3`,
      [userId]
    );

    const score = scoreRes.rows[0]
      ? {
          date: toDateOnly(new Date(scoreRes.rows[0].score_date)),
          riskScore: Number(scoreRes.rows[0].risk_score || 0),
          momentumScore: Number(scoreRes.rows[0].momentum_score || 0),
          reasons: typeof scoreRes.rows[0].reasons_json === 'string'
            ? JSON.parse(scoreRes.rows[0].reasons_json)
            : scoreRes.rows[0].reasons_json,
          recommendedActions: typeof scoreRes.rows[0].recommended_actions_json === 'string'
            ? JSON.parse(scoreRes.rows[0].recommended_actions_json)
            : scoreRes.rows[0].recommended_actions_json,
        }
      : null;

    const careerGoals = careerRes.rows.map((row) => ({
      goalId: row.goal_id,
      alignmentScore: row.alignment_score == null ? null : Number(row.alignment_score),
    }));

    const upcoming = upcomingRes.rows[0]
      ? {
          hasUpcoming: true,
          session: {
            id: upcomingRes.rows[0].id,
            date: toDateOnly(new Date(upcomingRes.rows[0].date)),
            startTime: String(upcomingRes.rows[0].start_time).slice(0, 5),
            mode: upcomingRes.rows[0].mode,
            subject: upcomingRes.rows[0].subject,
            joinLink: upcomingRes.rows[0].mode === 'online' ? '/tutor/sessions.html' : null,
          }
        }
      : {
          hasUpcoming: false,
          emptyState: {
            title: 'No upcoming session',
            ctaLabel: 'Book a session',
            ctaHref: '/contact'
          }
        };

    const recommendedNext = weakestTopic
      ? {
          title: `Recommended next: ${weakestTopic.topic}`,
          description: `Spend 25 focused minutes on ${weakestTopic.topic} to boost your mastery.`,
          action: 'Start focus mode'
        }
      : {
          title: 'Recommended next',
          description: 'Complete a short practice set to start your streak.',
          action: 'Do practice'
        };

      const scoreDrivenRecommendation = score?.recommendedActions?.[0];
      const goalRecommendation = careerGoals[0]
        ? {
            title: `Next step for goal: ${careerGoals[0].goalId}`,
            description: `Current goal alignment: ${careerGoals[0].alignmentScore ?? 0}%. Keep momentum with one focused practice block.`,
            action: 'View career roadmap'
          }
        : null;

    return reply.send({
      greeting: 'Welcome back, Jaydin — let’s keep the streak alive.',
      today: upcoming,
      thisWeek: {
        minutesStudied: Number(weekStats.minutes_studied || 0),
        sessionsAttended: Number(weekStats.sessions_attended || 0),
        streakDays: Number(streak.current || 0),
      },
      streak: {
        current: Number(streak.current || 0),
        longest: Number(streak.longest || 0),
        lastCreditedDate: streak.last_credited_date ? toDateOnly(new Date(streak.last_credited_date)) : null,
        xp: Number(streak.xp || 0),
      },
      progressSnapshot: topics,
      recommendedNext: scoreDrivenRecommendation
        ? {
            title: scoreDrivenRecommendation.label,
            description: (score?.reasons?.[0]?.detail || recommendedNext.description),
            action: 'Open recommendation'
          }
        : (goalRecommendation || recommendedNext),
      predictiveScore: score,
      careerGoals,
    });
  });

  app.get('/tutor/dashboard', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    logEvent(req, 'dashboard_viewed', { role: 'tutor' });

    const tutorId = req.user!.tutorId!;
    const today = toDateOnly(new Date());

    const todaySessionsRes = await pool.query(
      `select s.id, s.date, s.start_time, s.status, s.mode, st.full_name as student_name
       from sessions s
       join students st on st.id = s.student_id
       where s.tutor_id = $1 and s.date = $2::date
       order by s.start_time asc`,
      [tutorId, today]
    );

    const attentionRes = await pool.query(
      `select st.id, st.full_name,
              max(s.date) as last_session_date,
              max(case when s.status = 'REJECTED' then 1 else 0 end)::int as has_missed,
              coalesce(ss.current, 0)::int as current_streak,
              max(sae.occurred_at) as last_activity,
              latest.risk_score,
              latest.momentum_score,
              latest.reasons_json
       from students st
       join tutor_student_map tsm on tsm.student_id = st.id and tsm.tutor_id = $1
       left join users u on u.student_id = st.id
       left join study_streaks ss on ss.user_id = u.id
       left join study_activity_events sae on sae.user_id = u.id
       left join lateral (
         select risk_score, momentum_score, reasons_json
         from student_score_snapshots sss
         where sss.user_id = u.id
         order by score_date desc
         limit 1
       ) latest on true
       left join sessions s on s.student_id = st.id and s.tutor_id = $1
       group by st.id, st.full_name, ss.current, latest.risk_score, latest.momentum_score, latest.reasons_json
       order by latest.risk_score desc nulls last, st.full_name asc`,
      [tutorId]
    );

    const studentsNeedingAttention = attentionRes.rows
      .map((row) => {
        const reasons: string[] = [];
        const currentStreak = Number(row.current_streak || 0);
        const hasMissed = Number(row.has_missed || 0) > 0;
        const lastActivity = row.last_activity ? new Date(row.last_activity as string) : null;
        const riskScore = row.risk_score == null ? null : Number(row.risk_score || 0);
        const momentumScore = row.momentum_score == null ? null : Number(row.momentum_score || 0);

        if (currentStreak === 0) reasons.push('Streak broken');
        if (hasMissed) reasons.push('Missed recent session');
        if (!lastActivity || (Date.now() - lastActivity.getTime()) > 7 * DAY_MS) {
          reasons.push('Low weekly activity');
        }
        if (riskScore != null && riskScore >= 60) {
          reasons.push(`High risk score (${riskScore})`);
        }

        const modelReasons = row.reasons_json
          ? (typeof row.reasons_json === 'string' ? JSON.parse(row.reasons_json) : row.reasons_json)
          : [];

        return {
          studentId: row.id,
          studentName: row.full_name,
          currentStreak,
          riskScore,
          momentumScore,
          modelReasons,
          reasons,
        };
      })
      .filter((row) => row.reasons.length > 0)
      .slice(0, 8);

    return reply.send({
      todaySessions: todaySessionsRes.rows.map((row) => ({
        id: row.id,
        time: String(row.start_time).slice(0, 5),
        studentName: row.student_name,
        status: row.status,
        quickActions: [
          { label: 'Add notes', href: '/tutor/sessions.html' },
          { label: 'Assign practice', href: '/tutor/assignments.html' }
        ]
      })),
      studentsNeedingAttention,
      quickTools: [
        { id: 'assign_practice', label: 'Assign practice', href: '/tutor/assignments.html' },
        { id: 'session_notes', label: 'Add session notes', href: '/tutor/sessions.html' },
        { id: 'message_student', label: 'Message student', href: '/tutor/index.html' },
      ]
    });
  });

  app.post('/study-activity', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = StudyActivityEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const userId = req.user!.userId;
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    const occurredDate = toDateOnly(occurredAt);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (parsed.data.dedupeKey) {
        const existingRes = await client.query(
          `select id from study_activity_events where user_id = $1 and dedupe_key = $2 limit 1`,
          [userId, parsed.data.dedupeKey]
        );
        if (Number(existingRes.rowCount || 0) > 0) {
          await client.query('ROLLBACK');
          return reply.send({ ok: true, deduped: true, credited: false });
        }
      }

      await client.query(
        `insert into study_activity_events (user_id, type, occurred_at, metadata_json, dedupe_key)
         values ($1, $2, $3::timestamptz, $4::jsonb, $5)`,
        [userId, parsed.data.type, occurredAt.toISOString(), JSON.stringify(parsed.data.metadata || {}), parsed.data.dedupeKey ?? null]
      );

      await ensureStreakRow(client, userId);

      const streakRes = await client.query(
        `select current, longest, last_credited_date, xp
         from study_streaks
         where user_id = $1
         for update`,
        [userId]
      );

      const current = Number(streakRes.rows[0]?.current || 0);
      const longest = Number(streakRes.rows[0]?.longest || 0);
      const xp = Number(streakRes.rows[0]?.xp || 0);
      const lastCredited = streakRes.rows[0]?.last_credited_date
        ? toDateOnly(new Date(streakRes.rows[0].last_credited_date))
        : null;

      let nextCurrent = current;
      let nextLongest = longest;
      let nextXp = xp;
      let credited = false;

      if (lastCredited !== occurredDate) {
        credited = true;
        if (lastCredited) {
          const prev = Date.parse(`${lastCredited}T00:00:00.000Z`);
          const curr = Date.parse(`${occurredDate}T00:00:00.000Z`);
          const dayDiff = Math.round((curr - prev) / DAY_MS);
          nextCurrent = dayDiff === 1 ? current + 1 : 1;
        } else {
          nextCurrent = 1;
        }
        nextLongest = Math.max(longest, nextCurrent);
        nextXp = xp + BASE_DAILY_XP + (nextCurrent % 7 === 0 ? WEEK_BONUS_XP : 0);

        await client.query(
          `update study_streaks
           set current = $2,
               longest = $3,
               xp = $4,
               last_credited_date = $5::date,
               updated_at = now()
           where user_id = $1`,
          [userId, nextCurrent, nextLongest, nextXp, occurredDate]
        );
      }

      await client.query('COMMIT');

      if (credited) {
        logEvent(req, 'streak_credited', { currentStreak: nextCurrent, xp: nextXp });
      }

      return reply.send({
        ok: true,
        deduped: false,
        credited,
        streak: {
          current: nextCurrent,
          longest: nextLongest,
          lastCreditedDate: credited ? occurredDate : lastCredited,
          xp: nextXp,
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/reports/generate', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    const parsed = WeeklyReportGenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const role = req.user!.role;
    const tutorId = req.user!.tutorId;
    const week = parsed.data.weekStart ? getWeekRange(new Date(`${parsed.data.weekStart}T00:00:00.000Z`)) : getWeekRange(new Date());

    let studentId: string | null = null;
    if (role === 'STUDENT') {
      studentId = req.user!.studentId ?? await getStudentIdForUser(req.user!.userId);
    } else {
      studentId = parsed.data.studentId ?? null;
    }

    if (!studentId) {
      return reply.code(400).send({ error: 'student_id_required' });
    }

    const allowed = await userCanAccessStudent(req.user!.userId, role, studentId, tutorId);
    if (!allowed) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const payload = await buildWeeklyReportPayload(studentId, week.weekStart, week.weekEnd);
    if (!payload) {
      return reply.code(404).send({ error: 'student_not_found' });
    }

    const ownerRes = await pool.query(
      `select id from users where student_id = $1`,
      [studentId]
    );
    if (ownerRes.rowCount === 0) {
      return reply.code(409).send({ error: 'student_user_missing' });
    }
    const ownerUserId = ownerRes.rows[0].id as string;

    const res = await pool.query(
      `insert into weekly_reports (user_id, week_start, week_end, payload_json, created_by_user_id)
       values ($1, $2::date, $3::date, $4::jsonb, $5)
       on conflict (user_id, week_start, week_end)
       do update set payload_json = excluded.payload_json,
                     created_by_user_id = excluded.created_by_user_id,
                     created_at = now()
       returning id, user_id, week_start, week_end, created_at`,
      [ownerUserId, week.weekStart, week.weekEnd, JSON.stringify(payload), req.user!.userId]
    );

    logEvent(req, 'report_generated', { reportId: res.rows[0].id });

    return reply.code(201).send({ report: res.rows[0] });
  });

  app.get('/reports', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = WeeklyReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data as any, { pageSize: 20 });
    const role = req.user!.role;
    const studentIdFilter = parsed.data.studentId;

    const params: any[] = [];
    const filters: string[] = [];

    if (role === 'STUDENT') {
      params.push(req.user!.studentId ?? await getStudentIdForUser(req.user!.userId));
      filters.push(`u.student_id = $${params.length}`);
    } else if (role === 'TUTOR') {
      params.push(req.user!.tutorId);
      filters.push(`exists (
        select 1 from tutor_student_map tsm
        where tsm.tutor_id = $${params.length}
          and tsm.student_id = u.student_id
      )`);
    }

    if (studentIdFilter) {
      if (role === 'STUDENT') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      params.push(studentIdFilter);
      filters.push(`u.student_id = $${params.length}`);
    }

    const where = filters.length ? `where ${filters.join(' and ')}` : '';

    const listRes = await pool.query(
      `select wr.id, wr.week_start, wr.week_end, wr.created_at,
              u.student_id,
              s.full_name as student_name
       from weekly_reports wr
       join users u on u.id = wr.user_id
       left join students s on s.id = u.student_id
       ${where}
       order by wr.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)
       from weekly_reports wr
       join users u on u.id = wr.user_id
       ${where}`,
      params
    );

    return reply.send({
      items: listRes.rows,
      total: Number(totalRes.rows[0]?.count || 0),
      page,
      pageSize,
    });
  });

  app.get('/tutor/reports', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = WeeklyReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data as any, { pageSize: 20 });

    const params: any[] = [req.user!.tutorId];
    const filters: string[] = [`(
      exists (
        select 1 from tutor_student_map tsm
        where tsm.tutor_id = $1
          and tsm.student_id = u.student_id
      )
      or exists (
        select 1 from assignments a
        where a.tutor_id = $1
          and a.student_id = u.student_id
          and a.active = true
      )
    )`];

    if (parsed.data.studentId) {
      params.push(parsed.data.studentId);
      filters.push(`u.student_id = $${params.length}`);
    }

    const where = `where ${filters.join(' and ')}`;
    const listRes = await pool.query(
      `select wr.id, wr.week_start, wr.week_end, wr.created_at,
              u.student_id,
              s.full_name as student_name
       from weekly_reports wr
       join users u on u.id = wr.user_id
       left join students s on s.id = u.student_id
       ${where}
       order by wr.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)
       from weekly_reports wr
       join users u on u.id = wr.user_id
       ${where}`,
      params
    );

    return reply.send({
      items: listRes.rows,
      total: Number(totalRes.rows[0]?.count || 0),
      page,
      pageSize,
    });
  });

  app.get('/reports/:id', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const reportRes = await pool.query(
      `select wr.id, wr.user_id, wr.week_start, wr.week_end, wr.payload_json, wr.created_at,
              u.student_id
       from weekly_reports wr
       join users u on u.id = wr.user_id
       where wr.id = $1`,
      [params.data.id]
    );

    if (reportRes.rowCount === 0) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    const report = reportRes.rows[0];
    const allowed = await userCanAccessStudent(
      req.user!.userId,
      req.user!.role,
      report.student_id,
      req.user!.tutorId
    );
    if (!allowed) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    logEvent(req, 'report_viewed', { reportId: report.id });

    return reply.send({
      report: {
        id: report.id,
        weekStart: toDateOnly(new Date(report.week_start)),
        weekEnd: toDateOnly(new Date(report.week_end)),
        payload: normalizeJson(report.payload_json, {}),
        createdAt: report.created_at,
      }
    });
  });
}
