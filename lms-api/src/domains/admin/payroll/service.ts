import type { DbClient, AuditContext, AuditLogWriter } from '../shared/types.js';
import type { PayrollGenerateInput, AdjustmentCreateInput, DeleteAdjustmentInput } from './contracts.js';
import { getPayPeriodRange } from '../../../lib/pay-periods.js';
import { safeAuditMeta } from '../../../lib/audit.js';
import { generateInvoicesForWeek, getOrCreatePayPeriod, getSignedAmount } from './internal.js';

export async function generatePayrollWeek(client: DbClient, input: PayrollGenerateInput) {
  const weekStart = input.weekStart;
  const range = getPayPeriodRange(weekStart);

  const existing = await client.query(
    `select 1 from invoices where period_start = $1::date`,
    [weekStart]
  );
  if ((existing.rowCount ?? 0) > 0) return { error: 'invoices_already_generated' } as const;

  await client.query('BEGIN');
  try {
    const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
    if (payPeriod?.status === 'LOCKED') {
      await client.query('ROLLBACK');
      return { error: 'pay_period_locked' } as const;
    }

    const invoices = await generateInvoicesForWeek(client, weekStart, range.end);

    await client.query('COMMIT');
    return { invoices } as const;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function lockPayPeriod(client: DbClient, weekStart: string, adminId: string) {
  const range = getPayPeriodRange(weekStart);

  await client.query('BEGIN');
  try {
    const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
    if (!payPeriod) {
      await client.query('ROLLBACK');
      return { error: 'internal_error' } as const;
    }
    if (payPeriod.status === 'LOCKED') {
      await client.query('ROLLBACK');
      return { error: 'pay_period_locked' } as const;
    }

    const pendingRes = await client.query(
      `select count(*) as pending
       from sessions
       where status = 'SUBMITTED'
         and date between $1::date and $2::date`,
      [weekStart, range.end]
    );
    if (Number(pendingRes.rows[0].pending) > 0) {
      await client.query('ROLLBACK');
      return { error: 'pending_sessions' } as const;
    }

    const invoicesRes = await client.query(
      `select 1 from invoices where period_start = $1::date limit 1`,
      [weekStart]
    );
    if ((invoicesRes.rowCount ?? 0) === 0) {
      await generateInvoicesForWeek(client, weekStart, range.end);
    }

    const lockedRes = await client.query(
      `update pay_periods
       set status = 'LOCKED', locked_at = now(), locked_by_user_id = $2
       where period_start_date = $1::date
       returning id, status, locked_at, locked_by_user_id`,
      [weekStart, adminId]
    );

    await client.query('COMMIT');
    return { payPeriod: lockedRes.rows[0] } as const;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function createAdjustment(
  client: DbClient,
  weekStart: string,
  input: AdjustmentCreateInput,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  const range = getPayPeriodRange(weekStart);

  await client.query('BEGIN');
  try {
    const tutorRes = await client.query(`select 1 from tutor_profiles where id = $1`, [input.tutorId]);
    if (tutorRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { error: 'tutor_not_found' } as const;
    }

    if (input.relatedSessionId) {
      const sessionRes = await client.query(
        `select 1 from sessions
         where id = $1 and tutor_id = $2
           and date between $3::date and $4::date`,
        [input.relatedSessionId, input.tutorId, weekStart, range.end]
      );
      if (sessionRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return { error: 'related_session_invalid' } as const;
      }
    }

    const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
    if (!payPeriod) {
      await client.query('ROLLBACK');
      return { error: 'internal_error' } as const;
    }

    const res = await client.query(
      `insert into adjustments
       (tutor_id, pay_period_id, type, amount, reason, status, created_by_user_id, approved_by_user_id, approved_at, related_session_id)
       values ($1, $2, $3, $4, $5, 'APPROVED', $6, $6, now(), $7)
       returning *`,
      [
        input.tutorId,
        payPeriod.id,
        input.type,
        input.amount,
        input.reason,
        adminId,
        input.relatedSessionId ?? null
      ]
    );

    await audit(client, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'payroll.adjustment.create',
      entityType: 'adjustment',
      entityId: res.rows[0].id,
      meta: safeAuditMeta({
        tutorId: input.tutorId,
        amount: input.amount,
        type: input.type,
        relatedSessionId: input.relatedSessionId ?? null
      }),
      ip: context.ip,
      userAgent: context.userAgent,
      correlationId: context.correlationId
    });

    await client.query('COMMIT');
    const adjustment = res.rows[0];
    return {
      adjustment: {
        ...adjustment,
        signed_amount: getSignedAmount(adjustment.type, Number(adjustment.amount))
      }
    } as const;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function listAdjustments(client: DbClient, weekStart: string) {
  const res = await client.query(
    `select a.*, t.full_name as tutor_name
     from adjustments a
     join pay_periods p on p.id = a.pay_period_id
     join tutor_profiles t on t.id = a.tutor_id
     where p.period_start_date = $1::date
     order by a.created_at asc`,
    [weekStart]
  );

  const adjustments = res.rows.map((row) => ({
    ...row,
    signed_amount: getSignedAmount(row.type, Number(row.amount))
  }));

  return { adjustments } as const;
}

export async function deleteAdjustment(
  client: DbClient,
  adjustmentId: string,
  input: DeleteAdjustmentInput,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  const reason = input.reason ?? 'deleted_by_admin';

  const res = await client.query(
    `select a.id, p.status
     from adjustments a
     join pay_periods p on p.id = a.pay_period_id
     where a.id = $1`,
    [adjustmentId]
  );

  if (res.rowCount === 0) return { error: 'adjustment_not_found' } as const;
  if (res.rows[0].status === 'LOCKED') return { error: 'pay_period_locked' } as const;

  const updateRes = await client.query(
    `update adjustments
     set voided_at = now(), voided_by_user_id = $2, void_reason = $3
     where id = $1 and voided_at is null
     returning id, voided_at, voided_by_user_id`,
    [adjustmentId, adminId, reason]
  );

  if (updateRes.rowCount === 0) return { error: 'adjustment_already_voided' } as const;

  await audit(client, {
    actorUserId: adminId,
    actorRole: 'ADMIN',
    action: 'payroll.adjustment.delete',
    entityType: 'adjustment',
    entityId: adjustmentId,
    meta: safeAuditMeta({ reason }),
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId
  });

  return { adjustment: updateRes.rows[0] } as const;
}
