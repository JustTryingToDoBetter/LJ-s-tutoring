import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import StudentPortalClient from '@/components/app/StudentPortalClient';

export default async function Page() {
  await requireSession(['STUDENT']);

  const dashboardData: any = await apiGet('/dashboard').catch(() => ({
    greeting: 'Welcome back!',
    streak: { xp: 0, current: 0 },
    thisWeek: { sessionsAttended: 0 },
    today: { hasUpcoming: false },
    progressSnapshot: [],
    careerGoals: [],
  }));

  return (
    <div className="ody-container max-w-2xl mx-auto">
      <StudentPortalClient page="dashboard" initialData={dashboardData} />
    </div>
  );
}
