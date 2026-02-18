"use client";
import React, { useEffect, useState } from 'react';

type Props = {
  page: 'dashboard' | 'career' | 'community';
  initialData?: any;
};

export default function StudentPortalClient({ page, initialData }: Props) {
  const [data, setData] = useState(initialData || {});
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData) {return;}
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/student/${page}`, { credentials: 'include' });
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
    case 'dashboard': {
      const greeting = data.greeting || 'Welcome back!';
      const xp = data.streak?.xp || 0;
      const streak = data.streak?.current || 0;
      const today = data.today || {};
      const progress = data.progressSnapshot || [];

      return (
        <div>
          <h1 className="text-2xl font-bold mb-4">{greeting}</h1>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="panel">
              <div className="text-ody-muted text-sm">XP</div>
              <div className="text-2xl font-bold">{xp}</div>
            </div>
            <div className="panel">
              <div className="text-ody-muted text-sm">Current Streak</div>
              <div className="text-2xl font-bold">{streak} days</div>
            </div>
            <div className="panel">
              <div className="text-ody-muted text-sm">Week Sessions</div>
              <div className="text-2xl font-bold">{data.thisWeek?.sessionsAttended || 0}</div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Today</h2>
            {today.hasUpcoming ? (
              <div className="panel">
                <div className="font-medium">{today.session?.subject || 'Session'} at {today.session?.startTime || '--'}</div>
                <div className="text-ody-muted text-sm">{today.session?.date || ''}</div>
              </div>
            ) : (
              <div className="panel text-ody-muted">No upcoming sessions</div>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Progress</h2>
            {progress.length === 0 ? (
              <div className="panel text-ody-muted">No progress yet</div>
            ) : (
              <div className="space-y-2">
                {progress.slice(0, 5).map((topic: any) => (
                  <div key={topic.topic} className="panel">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium text-sm">{topic.topic}</span>
                      <span className="text-xs text-ody-muted">{Math.round(topic.completion || 0)}%</span>
                    </div>
                    <div className="w-full h-2 bg-ody-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gold rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, topic.completion || 0))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'career': {
      const goals = data.careerGoals || [];
      return (
        <div>
          <h1 className="text-xl font-bold mb-4">Career Mapping</h1>
          {goals.length === 0 ? (
            <div className="panel text-ody-muted">No career goals selected</div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal: any) => (
                <div key={goal.goalId} className="panel">
                  <div className="font-medium">{goal.goalId}</div>
                  <div className="text-sm text-ody-muted">Alignment: {Math.round(goal.alignmentScore || 0)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'community': {
      const community = data.community || {};
      return (
        <div>
          <h1 className="text-xl font-bold mb-4">Community</h1>
          <div className="panel">
            <p className="text-ody-muted">Connect with peers and share your progress</p>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
