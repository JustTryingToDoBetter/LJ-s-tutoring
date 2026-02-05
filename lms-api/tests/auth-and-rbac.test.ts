import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';
import { createAdmin, issueMagicToken, loginWithMagicToken } from './helpers/factories.js';

describe('Auth + RBAC', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('verifies magic link and sets session cookie', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);

    const { response, cookie } = await loginWithMagicToken(app, token);
    expect(response.statusCode).toBe(302);
    expect(cookie).toMatch(/^session=/);
    await app.close();
  });

  it('blocks admin routes without cookie', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/students',
      payload: { fullName: 'A B' }
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
