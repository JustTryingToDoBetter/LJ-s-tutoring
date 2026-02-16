export type UserRole = 'ADMIN' | 'TUTOR' | 'STUDENT';

export type SessionUser = {
  userId: string;
  role: UserRole;
  tutorId?: string | null;
  studentId?: string | null;
};

export type SessionPayload = {
  user: SessionUser;
  impersonation: {
    adminUserId: string;
    tutorId: string;
    tutorUserId: string;
    impersonationId: string;
    mode: 'READ_ONLY';
  } | null;
};
