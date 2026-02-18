import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import TutorPortalClient from '@/components/app/TutorPortalClient';

export default async function Page() {
  await requireSession(['TUTOR']);
  const me: any = await apiGet('/tutor/me').catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions: any = await apiGet(`/tutor/sessions?from=${today}&to=${today}`).catch(() => ({ sessions: [] }));

  const initialData = {
    me,
    todaySessions: todaySessions?.sessions || [],
  };

  return (
    <div className="ody-container">
      <TutorPortalClient page="home" initialData={initialData} />
    </div>
  );
}
