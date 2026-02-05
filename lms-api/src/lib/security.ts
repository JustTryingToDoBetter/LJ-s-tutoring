import argon2 from 'argon2';
import crypto from 'node:crypto';

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateMagicToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
