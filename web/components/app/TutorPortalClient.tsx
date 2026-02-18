"use client";
import React, { useEffect, useState } from 'react';

type Props = {
  page: 'home' | 'sessions' | 'assignments' | 'payroll' | 'invoices';
  initialData?: any;
};

export default function TutorPortalClient({ page, initialData }: Props) {
  const [data, setData] = useState(initialData || {});
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData) {return;}
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/tutor/${page}`, { credentials: 'include' });
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [page, initialData]);

  if (loading) {
    return <div className="panel">Loading…</div>;
  }

  switch (page) {
    case 'home': {
      const me = data.me || {};
      return (
        <div>
          <h1 className="text-xl font-bold">Welcome back{me?.full_name ? `, ${me.full_name}` : ''}</h1>
          <div className="mt-4">
            <h2 className="font-semibold">Today</h2>
            <div className="mt-2">
              {(data.todaySessions || []).length === 0 ? (
                <div className="panel">No sessions today</div>
              ) : (
                (data.todaySessions || []).map((s: any) => (
                  <div key={s.id} className="panel mb-2">
                    <div className="font-medium">{s.time} · {s.student_name || s.studentName}</div>
                    <div className="text-ody-muted">{s.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'sessions': {
      const sessions = data.sessions || [];
      return (
        <div>
          <h1 className="text-xl font-bold">Sessions</h1>
          <div className="mt-3 grid gap-2">
            {sessions.length === 0 ? (
              <div className="panel">No sessions logged yet.</div>
            ) : (
              sessions.map((s: any) => (
                <div key={s.id || s.session_id} className="panel">
                  <div className="font-medium">{s.student_name || s.studentName}</div>
                  <div className="text-ody-muted">{s.date} {s.start_time}-{s.end_time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    case 'assignments': {
      const assignments = data.assignments || [];
      return (
        <div>
          <h1 className="text-xl font-bold">Assignments</h1>
          <div className="mt-3 grid gap-2">
            {assignments.length === 0 ? (
              <div className="panel">No assignments available</div>
            ) : (
              assignments.map((a: any) => (
                <div key={a.id} className="panel">
                  <div className="font-medium">{a.subject} — {a.full_name}</div>
                  <div className="text-ody-muted">{a.start_date} to {a.end_date || 'open-ended'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    case 'payroll': {
      const weeks = data.weeks || [];
      return (
        <div>
          <h1 className="text-xl font-bold">Payroll</h1>
          <div className="mt-3 grid gap-2">
            {weeks.length === 0 ? (
              <div className="panel">No payroll data</div>
            ) : (
              weeks.map((w: any) => (
                <div key={w.week_start} className="panel">
                  <div className="font-medium">{w.week_start} • {w.status}</div>
                  <div className="text-ody-muted">{w.total_minutes} mins • R{Number(w.total_amount || 0).toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    case 'invoices': {
      const invoices = data.invoices || [];
      return (
        <div>
          <h1 className="text-xl font-bold">Invoices</h1>
          <div className="mt-3 grid gap-2">
            {invoices.length === 0 ? (
              <div className="panel">No invoices yet</div>
            ) : (
              invoices.map((inv: any) => (
                <div key={inv.id} className="panel">
                  <div className="font-medium">{inv.invoice_number}</div>
                  <div className="text-ody-muted">{inv.period_start} — {inv.period_end} • R{Number(inv.total_amount || 0).toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
