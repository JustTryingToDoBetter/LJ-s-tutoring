import { randomUUID } from 'crypto';

export function createRequestId() {
  try {
    return randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
