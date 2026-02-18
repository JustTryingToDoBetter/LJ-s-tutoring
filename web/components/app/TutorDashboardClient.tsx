"use client";
import React from 'react';

type TodaySession = { id: string; time: string; studentName: string; status: string; quickActions?: Array<{ label: string; href: string }>; };
type AttentionItem = { studentId: string; studentName: string; currentStreak: number; riskScore?: number | null; momentumScore?: number | null; reasons?: string[] };

export default function TutorDashboardClient({ initialData }: { initialData: { todaySessions: TodaySession[]; studentsNeedingAttention: AttentionItem[]; quickTools: Array<{ id: string; label: string; href: string }>; }; }) {
  const data = initialData || { todaySessions: [], studentsNeedingAttention: [], quickTools: [] };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h2 className="sr-only">Today’s sessions</h2>
        <div className="mt-3 grid gap-2">
          {data.todaySessions.length === 0 ? (
            <div className="panel">No sessions today</div>
          ) : (
            data.todaySessions.map((item) => (
              <div key={item.id} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
                <p className="font-medium">{item.time} • {item.studentName}</p>
                <p className="text-ody-muted">{item.status}</p>
                <div className="mt-2 flex gap-2">
                  {(item.quickActions || []).map((a, idx) => (
                    <a key={idx} className="button secondary" href={a.href}>{a.label}</a>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="sr-only">Students needing attention</h2>
        <div className="mt-3 grid gap-2">
          {data.studentsNeedingAttention.length === 0 ? (
            <div className="panel">No urgent attention needed</div>
          ) : (
            data.studentsNeedingAttention.map((item) => (
              <div key={item.studentId} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
                <p className="font-medium">{item.studentName}</p>
                <p className="text-ody-muted">Risk {item.riskScore ?? '-'} • Momentum {item.momentumScore ?? '-'}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold">Quick tools</h3>
          <div className="mt-2 flex gap-2">
            {data.quickTools.map((t) => (
              <a key={t.id} className="button" href={t.href}>{t.label}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
