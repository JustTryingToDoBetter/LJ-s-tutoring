import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import TutorPortalClient from '@/components/app/TutorPortalClient';

export default async function Page() {
  await requireSession(['TUTOR']);
  const assignments: any = await apiGet('/tutor/assignments').catch(() => ({ assignments: [] }));

  return (
    <div className="ody-container">
      <TutorPortalClient page="assignments" initialData={{ assignments: assignments.assignments || [] }} />
    </div>
  );
}
