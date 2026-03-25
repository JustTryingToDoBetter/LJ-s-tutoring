import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

describe('observability endpoints', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('exposes prometheus-style counters at /metrics', async () => {
    const app = await buildApp();

    const first = await app.inject({ method: 'GET', url: '/health' });
    expect(first.statusCode).toBeGreaterThanOrEqual(200);

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');

    const body = metrics.body;
    expect(body).toContain('po_requests_total');
    expect(body).toContain('po_requests_slow_total');
    expect(body).toContain('po_requests_error_total');

    await app.close();
  });
});
