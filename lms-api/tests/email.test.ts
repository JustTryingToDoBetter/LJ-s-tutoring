import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { requestMagicLink } from '../src/domains/auth/service.js';

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

describe('email sending', () => {
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalProviderKey = process.env.EMAIL_PROVIDER_KEY;
  const originalProviderService = process.env.EMAIL_PROVIDER_SERVICE;

  beforeEach(() => {
    vi.clearAllMocks();
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    process.env.EMAIL_FROM = 'noreply@example.com';
    process.env.EMAIL_PROVIDER_KEY = 'sg_test_key';
    process.env.EMAIL_PROVIDER_SERVICE = 'sendgrid';
  });

  afterEach(() => {
    process.env.EMAIL_FROM = originalEmailFrom;
    process.env.EMAIL_PROVIDER_KEY = originalProviderKey;
    process.env.EMAIL_PROVIDER_SERVICE = originalProviderService;
  });

  it('sends magic-link email with expected payload', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'user-1',
            role: 'TUTOR',
            tutor_profile_id: 'tutor-1',
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const db = { query };

    const result = await requestMagicLink(db as any, { email: 'Tutor@Example.com' }, {
      checkRequestLimit: () => false,
      baseUrl: 'http://localhost:3001',
    });

    expect(result).toEqual({ ok: true });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const sendMailArg = sendMailMock.mock.calls[0]?.[0] ?? {};
    expect(sendMailArg).toMatchObject({
      from: 'noreply@example.com',
      to: 'tutor@example.com',
      subject: 'Your login link',
    });
    expect(String(sendMailArg.html || '')).toContain('http://localhost:3001/auth/verify?token=');
  });
});
