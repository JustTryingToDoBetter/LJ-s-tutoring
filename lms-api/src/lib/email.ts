import nodemailer from 'nodemailer';

type SendMagicLinkParams = {
  to: string;
  link: string;
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
