import nodemailer from 'nodemailer';

type SendMagicLinkParams = {
  to: string;
  link: string;
};

type SendOtpEmailParams = {
  to: string;
  code: string;
};

export async function sendMagicLink({ to, link }: SendMagicLinkParams) {
  const from = process.env.EMAIL_FROM;
  const apiKey = process.env.EMAIL_PROVIDER_KEY;

  if (!from) {
    throw new Error('EMAIL_FROM is required');
  }

  if (!apiKey) {
    console.log(`[magic-link] ${to} -> [redacted]`);
    return;
  }

  const transport = nodemailer.createTransport({
    service: process.env.EMAIL_PROVIDER_SERVICE ?? 'sendgrid',
    auth: {
      user: 'apikey',
      pass: apiKey
    }
  });

  await transport.sendMail({
    from,
    to,
    subject: 'Your login link',
    text: `Use this link to sign in: ${link}`,
    html: `<p>Use this link to sign in:</p><p><a href="${link}">${link}</a></p>`
  });
}

function createTransport() {
  const from = process.env.EMAIL_FROM;
  const apiKey = process.env.EMAIL_PROVIDER_KEY;
  if (!from) throw new Error('EMAIL_FROM is required');
  if (!apiKey) return null;
  return nodemailer.createTransport({
    service: process.env.EMAIL_PROVIDER_SERVICE ?? 'sendgrid',
    auth: { user: 'apikey', pass: apiKey }
  });
}

export async function sendOtpEmail({ to, code }: SendOtpEmailParams) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM is required');

  const transport = createTransport();
  if (!transport) {
    console.log(`[otp-email] ${to} -> code: ${code}`);
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: 'Your admin sign-in code',
    text: `Your sign-in code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
    html: `<p>Your admin sign-in code is:</p><p style="font-size:2em;letter-spacing:0.2em;font-weight:bold">${code}</p><p>This code expires in 5 minutes. Do not share it with anyone.</p>`
  });
}
