import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import TutorPortalClient from '@/components/app/TutorPortalClient';

export default async function Page() {
  await requireSession(['TUTOR']);
  const sessions: any = await apiGet('/tutor/sessions').catch(() => ({ sessions: [] }));

  return (
    <div className="ody-container">
      <TutorPortalClient page="sessions" initialData={{ sessions: sessions.sessions || [] }} />
    </div>
  );
}
