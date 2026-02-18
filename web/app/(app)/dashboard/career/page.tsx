import React from 'react';
import { requireSession } from '@/lib/server-auth';
import { apiGet } from '@/lib/server-api';
import StudentPortalClient from '@/components/app/StudentPortalClient';

export default async function CareerPage() {
  await requireSession(['STUDENT']);

  const careerData: any = await apiGet('/student/career').catch(() => ({
    careerGoals: [],
  }));

  return (
    <div className="ody-container max-w-2xl mx-auto">
      <StudentPortalClient page="career" initialData={careerData} />
    </div>
  );
}
