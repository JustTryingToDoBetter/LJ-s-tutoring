import { expect, test } from '@playwright/test';

type Role = 'ADMIN' | 'TUTOR' | 'STUDENT';

type AuthSession = {
  sessionCookie: string;
  csrfCookie: string;
};

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3101';

function cookieMap(setCookieHeaders: string[]) {
  const cookies: Record<string, string> = {};
  for (const raw of setCookieHeaders) {
    const pair = raw.split(';', 1)[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    cookies[name] = value;
  }
  return cookies;
}

function localDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekStart(base = new Date()) {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

async function loginAs(
  page: import('@playwright/test').Page,
  role: Role,
  email: string,
  csrfToken?: string
): Promise<AuthSession> {
  const response = await page.request.post(`${apiBaseUrl}/test/login-as`, {
    data: { role, email },
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`test_login_failed role=${role} email=${email} status=${response.status()} body=${body}`);
  }

  const setCookieHeaders = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);

  const cookies = cookieMap(setCookieHeaders);
  const sessionCookie = cookies.session;
  const csrfCookie = cookies.csrf;

  expect(sessionCookie).toBeTruthy();
  expect(csrfCookie).toBeTruthy();

  return { sessionCookie, csrfCookie };
}

async function applyAuthToBrowser(page: import('@playwright/test').Page, auth: AuthSession) {
  await page.context().addCookies([
    { name: 'session', value: auth.sessionCookie, url: apiBaseUrl },
    { name: 'csrf', value: auth.csrfCookie, url: apiBaseUrl },
  ]);
}

async function apiRequest(
  page: import('@playwright/test').Page,
  auth: AuthSession,
  path: string,
  options?: { method?: string; body?: unknown }
) {
  return page.request.fetch(`${apiBaseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      cookie: `session=${auth.sessionCookie}; csrf=${auth.csrfCookie}`,
      'x-csrf-token': auth.csrfCookie,
      ...(options?.body ? { 'content-type': 'application/json' } : {}),
    },
    data: options?.body,
  });
}

test('critical reject flow: submit, reject with reason, and verify rejected status with history evidence', async ({ page }) => {
  const unique = Date.now().toString();
  const rejectReason = `invalid-timesheet-${unique}`;

  const tutorEmail = `tutor-browser-reject-${unique}@test.local`;
  const studentName = `Student Browser Reject ${unique}`;

  const admin = await loginAs(page, 'ADMIN', `admin-browser-reject-${unique}@test.local`);
  const tutor = await loginAs(page, 'TUTOR', tutorEmail, admin.csrfCookie);

  const tutorSessionRes = await apiRequest(page, tutor, '/auth/session');
  expect(tutorSessionRes.status()).toBe(200);
  const tutorSession = await tutorSessionRes.json();
  const tutorId = tutorSession.user?.tutorId as string;
  expect(tutorId).toBeTruthy();

  const tutorPatchRes = await apiRequest(page, admin, `/admin/tutors/${tutorId}`, {
    method: 'PATCH',
    body: {
      qualificationBand: 'BOTH',
      qualifiedSubjects: ['Mathematics'],
      defaultHourlyRate: 300,
      active: true,
    },
  });
  expect(tutorPatchRes.status()).toBe(200);

  const studentCreateRes = await apiRequest(page, admin, '/admin/students', {
    method: 'POST',
    body: { fullName: studentName, grade: '10' },
  });
  expect(studentCreateRes.status()).toBe(201);
  const studentCreated = await studentCreateRes.json();
  const studentId = studentCreated.student.id as string;

  const assignmentCreateRes = await apiRequest(page, admin, '/admin/assignments', {
    method: 'POST',
    body: {
      tutorId,
      studentId,
      subject: 'Mathematics',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      allowedDays: [0, 1, 2, 3, 4, 5, 6],
      allowedTimeRanges: [{ start: '06:00', end: '22:00' }],
    },
  });
  expect(assignmentCreateRes.status()).toBe(201);
  const assignmentCreated = await assignmentCreateRes.json();
  const assignmentId = assignmentCreated.assignment.id as string;

  const sessionDate = localDateOnly(weekStart());
  const createSessionRes = await apiRequest(page, tutor, '/tutor/sessions', {
    method: 'POST',
    body: {
      assignmentId,
      studentId,
      date: sessionDate,
      startTime: '09:00',
      endTime: '10:00',
      mode: 'online',
      notes: 'Browser E2E reject flow',
    },
  });
  expect(createSessionRes.status()).toBe(201);
  const createdSession = await createSessionRes.json();
  const sessionId = createdSession.session.id as string;

  const submitRes = await apiRequest(page, tutor, `/tutor/sessions/${sessionId}/submit`, { method: 'POST' });
  expect(submitRes.status()).toBe(200);

  await applyAuthToBrowser(page, tutor);
  await page.goto('/tutor/sessions.html');
  await expect(page.locator('#tutorSessionsList')).toContainText(studentName);
  await expect(page.locator('#tutorSessionsList')).toContainText('Status: SUBMITTED');

  const rejectRes = await apiRequest(page, admin, `/admin/sessions/${sessionId}/reject`, {
    method: 'POST',
    body: { reason: rejectReason },
  });
  expect(rejectRes.status()).toBe(200);

  const historyRes = await apiRequest(page, admin, `/admin/sessions/${sessionId}/history`);
  expect(historyRes.status()).toBe(200);
  const history = await historyRes.json();
  expect(Array.isArray(history.history)).toBeTruthy();
  const serializedHistory = JSON.stringify(history.history);
  expect(serializedHistory).toContain('reject');
  expect(serializedHistory).toContain(rejectReason);

  const rejectedQueryRes = await apiRequest(
    page,
    admin,
    `/admin/sessions?status=REJECTED&q=${encodeURIComponent(studentName)}`
  );
  expect(rejectedQueryRes.status()).toBe(200);
  const rejectedQuery = await rejectedQueryRes.json();
  expect(Array.isArray(rejectedQuery.items)).toBeTruthy();
  expect(rejectedQuery.items.some((item: any) => item.id === sessionId)).toBeTruthy();

  await applyAuthToBrowser(page, tutor);
  await page.goto('/tutor/sessions.html');
  await expect(page.locator('#tutorSessionsList')).toContainText(studentName);
  await expect(page.locator('#tutorSessionsList')).toContainText('Status: REJECTED');
});
