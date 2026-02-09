import crypto from 'node:crypto';

export type ArcadeSessionTokenPayload = {
  version: number;
  sessionId: string;
  playerId: string;
  gameId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  clientFingerprintHash?: string | null;
};

const TOKEN_VERSION = 1;

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function hashFingerprint(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signArcadeSessionToken(payload: Omit<ArcadeSessionTokenPayload, 'version'>, secret: string) {
  const body: ArcadeSessionTokenPayload = { ...payload, version: TOKEN_VERSION };
  const encoded = base64UrlEncode(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyArcadeSessionToken(token: string, secret: string) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  try {
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(encoded)) as ArcadeSessionTokenPayload;
    if (decoded.version !== TOKEN_VERSION) return null;
    return decoded;
  } catch {
    return null;
  }
}
