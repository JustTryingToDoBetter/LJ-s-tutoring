import { describe, it, expect } from 'vitest';

type AuthSession = { cookie: string; csrfToken: string };

type RequestOptions = {
  method?: string;
  body?: any;
  auth?: AuthSession;
};

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

function parseCookies(setCookieHeaders: string[]) {
  const cookies: Record<string, string> = {};
  for (const raw of setCookieHeaders) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    cookies[name] = value;
  }
  return cookies;
}

function getSetCookieHeaders(response: Response) {
  const anyHeaders = response.headers as any;
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie() as string[];
  }
  const fallback = response.headers.get('set-cookie');
  return fallback ? [fallback] : [];
}

async function loginAs(role: 'ADMIN' | 'TUTOR', email: string): Promise<AuthSession> {
  const res = await fetch(`${baseUrl}/test/login-as`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, email })
  });

  expect(res.status).toBe(200);
  const cookies = parseCookies(getSetCookieHeaders(res));
  const session = cookies.session;
  const csrf = cookies.csrf;

  expect(session).toBeTruthy();
  expect(csrf).toBeTruthy();

  return {
    cookie: `session=${session}; csrf=${csrf}`,
    csrfToken: csrf
  };
}

async function apiRequest(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.body != null) headers['content-type'] = 'application/json';
  if (options.auth) {
    headers.cookie = options.auth.cookie;
    headers['x-csrf-token'] = options.auth.csrfToken;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });

  return res;
}

describe('E2E money flow (API)', () => {
  it('runs the full payroll flow and exports CSV', async () => {
    const admin = await loginAs('ADMIN', 'admin-e2e@test.local');

    const tutorRes = await apiRequest('/admin/tutors', {
      method: 'POST',
      auth: admin,
      body: {
        email: 'tutor-e2e@test.local',
        fullName: 'Tutor E2E',
        defaultHourlyRate: 300
      }
    });
    expect(tutorRes.status).toBe(201);
    const tutorPayload = await tutorRes.json();
    const tutorId = tutorPayload.tutor.id as string;

    const tutor = await loginAs('TUTOR', 'tutor-e2e@test.local');

    const studentRes = await apiRequest('/admin/students', {
      method: 'POST',
      auth: admin,
      body: { fullName: 'Student E2E', grade: '10' }
    });
    expect(studentRes.status).toBe(201);
    const studentPayload = await studentRes.json();
    const studentId = studentPayload.student.id as string;

    const assignmentRes = await apiRequest('/admin/assignments', {
      method: 'POST',
      auth: admin,
      body: {
        tutorId,
        studentId,
        subject: 'Math',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        allowedDays: [1, 2, 3, 4, 5],
        allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
      }
    });
    expect(assignmentRes.status).toBe(201);
    const assignmentPayload = await assignmentRes.json();
    const assignmentId = assignmentPayload.assignment.id as string;

    const sessionRes = await apiRequest('/tutor/sessions', {
      method: 'POST',
      auth: tutor,
      body: {
        assignmentId,
        studentId,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });
    expect(sessionRes.status).toBe(201);
    const sessionPayload = await sessionRes.json();
    const sessionId = sessionPayload.session.id as string;

    const submitRes = await apiRequest(`/tutor/sessions/${sessionId}/submit`, {
      method: 'POST',
      auth: tutor
    });
    expect(submitRes.status).toBe(200);

    const approveRes = await apiRequest(`/admin/sessions/${sessionId}/approve`, {
      method: 'POST',
      auth: admin
    });
    expect(approveRes.status).toBe(200);

    const payrollRes = await apiRequest('/admin/payroll/generate-week', {
      method: 'POST',
      auth: admin,
      body: { weekStart: '2026-02-02' }
    });
    expect(payrollRes.status).toBe(200);
    const payrollPayload = await payrollRes.json();
    expect(payrollPayload.invoices.length).toBe(1);

    const invoicesRes = await apiRequest('/tutor/invoices?from=2026-02-01&to=2026-02-28', {
      auth: tutor
    });
    expect(invoicesRes.status).toBe(200);
    const invoicesPayload = await invoicesRes.json();
    expect(invoicesPayload.invoices.length).toBe(1);

    const invoiceId = invoicesPayload.invoices[0].id as string;
    const invoiceHtmlRes = await apiRequest(`/tutor/invoices/${invoiceId}`, { auth: tutor });
    expect(invoiceHtmlRes.status).toBe(200);
    const invoiceHtml = await invoiceHtmlRes.text();
    expect(invoiceHtml).toContain('Tutor E2E');
    expect(invoiceHtml).toContain('Math');

    const csvRes = await apiRequest('/admin/payroll/week/2026-02-02.csv', { auth: admin });
    expect(csvRes.status).toBe(200);
    const csv = await csvRes.text();
    expect(csv).toContain('invoice_number');
    expect(csv).toContain('Tutor E2E');
  }, 30000);
});
