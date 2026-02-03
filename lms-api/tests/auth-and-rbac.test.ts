import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';

describe('Auth + RBAC', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('bootstraps an admin and logs in', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap';
    const app = await buildApp();

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register-admin',
      payload: {
        email: 'admin@example.com',
        password: 'superstrongpassword123',
        firstName: 'Admin',
        lastName: 'User',
        bootstrapToken: 'bootstrap'
      }
    });

    expect(reg.statusCode).toBe(201);
    const regBody = reg.json();
    expect(regBody.token).toBeTruthy();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@example.com', password: 'superstrongpassword123' }
    });

    expect(login.statusCode).toBe(200);
    expect(login.json().token).toBeTruthy();
    await app.close();
  });

  it('blocks admin routes without token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/admin/students', payload: { firstName: 'A', lastName: 'B' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
