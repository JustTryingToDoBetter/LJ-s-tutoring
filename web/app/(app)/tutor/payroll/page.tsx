import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import TutorPortalClient from '@/components/app/TutorPortalClient';

export default async function Page() {
  await requireSession(['TUTOR']);
  const weeks: any = await apiGet('/tutor/payroll/weeks').catch(() => ({ weeks: [] }));

  return (
    <div className="ody-container">
      <TutorPortalClient page="payroll" initialData={{ weeks: weeks.weeks || [] }} />
    </div>
  );
}
