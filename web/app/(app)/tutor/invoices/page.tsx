import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import TutorPortalClient from '@/components/app/TutorPortalClient';

export default async function Page() {
  await requireSession(['TUTOR']);
  const invoices: any = await apiGet('/tutor/invoices').catch(() => ({ invoices: [] }));

  return (
    <div className="ody-container">
      <TutorPortalClient page="invoices" initialData={{ invoices: invoices.invoices || [] }} />
    </div>
  );
}
