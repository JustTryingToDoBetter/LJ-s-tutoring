"use client";
import React from 'react';

type ProgressTopic = { topic: string; completion: number };

export default function StudentDashboardClient({ initialData }: { initialData: { greeting?: string; thisWeek?: any; streak?: any; today?: any; recommendedNext?: any; progressSnapshot?: ProgressTopic[]; predictiveScore?: any; }; }) {
  const data = initialData || {};

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Recommended next</h3>
          <p className="text-ody-muted mt-2">{data.recommendedNext?.description || 'Do one focused activity today.'}</p>
          <button className="ody-btn-primary mt-3">{data.recommendedNext?.action || 'Start now'}</button>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Upcoming session</h3>
          <p className="text-ody-muted mt-2">{data.today?.hasUpcoming && data.today.session ? `${data.today.session.subject} • ${data.today.session.startTime}` : (data.today?.emptyState?.title || 'No upcoming session')}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div>
          <h3 className="text-sm font-semibold">Topic progress</h3>
          <div className="mt-3 grid gap-2">
            {(data.progressSnapshot || []).map((t: ProgressTopic) => (
              <div key={t.topic}>
                <div className="mb-1 flex justify-between text-sm"><span>{t.topic}</span><span>{t.completion}%</span></div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-ody-gradient" style={{ width: `${Math.max(0, Math.min(100, t.completion))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Streak</h3>
          <div className="panel mt-3">
            <div className="font-medium">Current: {data.streak?.current ?? 0}</div>
            <div className="text-ody-muted text-sm">Longest: {data.streak?.longest ?? 0} • XP: {data.streak?.xp ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
