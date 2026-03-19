import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { createAdmin, createStudent, issueMagicToken, loginWithMagicToken } from './helpers/factories.js';

describe('Phase 2 assistant, parent portal, and vault', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates assistant responses with vault citations and enforces thread ownership', async () => {
    const app = await buildApp();

    const student = await createStudent({ fullName: 'Assistant Student' });
    const studentUserRes = await pool.query(
      `insert into users (email, role, student_id, tier)
       values ($1, 'STUDENT', $2, 'BASIC')
       returning id`,
      ['assistant-student@test.local', student.id]
    );

    const outsider = await createStudent({ fullName: 'Outsider Student' });
    const outsiderUserRes = await pool.query(
      `insert into users (email, role, student_id, tier)
       values ($1, 'STUDENT', $2, 'BASIC')
       returning id`,
      ['assistant-outsider@test.local', outsider.id]
    );

    const resourceRes = await pool.query(
      `insert into vault_resources (title, description, category, body_markdown, minimum_tier, is_published, is_public_preview, created_by_user_id)
       values ($1, $2, $3, $4, 'BASIC', true, false, $5)
       returning id`,
      [
        'Algebra Drill Pack',
        'Practice algebraic simplification',
        'Algebra',
        'To simplify expressions, combine like terms and preserve operation order. Example: 2x + 3x = 5x.',
        studentUserRes.rows[0].id
      ]
    );

    await pool.query(
      `insert into vault_access_rules (resource_id, role, is_allowed)
       values ($1, 'STUDENT', true)`,
      [resourceRes.rows[0].id]
    );

    const studentAuth = await loginWithMagicToken(app, await issueMagicToken(studentUserRes.rows[0].id));
    const outsiderAuth = await loginWithMagicToken(app, await issueMagicToken(outsiderUserRes.rows[0].id));

    const threadRes = await app.inject({
      method: 'POST',
      url: '/assistant/threads',
      headers: studentAuth.headers,
      payload: { title: 'Algebra help' }
    });
    expect(threadRes.statusCode).toBe(201);

    const threadId = threadRes.json().thread.id as string;

    const messageRes = await app.inject({
      method: 'POST',
      url: `/assistant/threads/${threadId}/messages`,
      headers: studentAuth.headers,
      payload: { message: 'How do I simplify algebra expressions?', dedupeKey: 'assist-1' }
    });

    expect(messageRes.statusCode).toBe(201);
    expect(Array.isArray(messageRes.json().assistantMessage.citations)).toBe(true);
    expect(messageRes.json().assistantMessage.citations.length).toBeGreaterThan(0);

    const outsiderView = await app.inject({
      method: 'GET',
      url: `/assistant/threads/${threadId}`,
      headers: outsiderAuth.headers
    });
    expect(outsiderView.statusCode).toBe(404);

    await app.close();
  });

  it('supports parent invite and accept flow with linked student visibility', async () => {
    const app = await buildApp();

    const admin = await createAdmin('phase2-admin@test.local');
    const student = await createStudent({ fullName: 'Parent Linked Student' });

    const parentUserRes = await pool.query(
      `insert into users (email, role, tier)
       values ($1, 'PARENT', 'BASIC')
       returning id`,
      ['parent@test.local']
    );

    const parentProfileRes = await pool.query(
      `insert into parent_profiles (user_id, full_name, phone)
       values ($1, $2, $3)
       returning id`,
      [parentUserRes.rows[0].id, 'Parent One', null]
    );

    await pool.query(
      `update users
       set parent_profile_id = $1
       where id = $2`,
      [parentProfileRes.rows[0].id, parentUserRes.rows[0].id]
    );

    const adminAuth = await loginWithMagicToken(app, await issueMagicToken(admin.id));
    const parentAuth = await loginWithMagicToken(app, await issueMagicToken(parentUserRes.rows[0].id));

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/parent/invites',
      headers: adminAuth.headers,
      payload: {
        studentId: student.id,
        email: 'parent@test.local',
        relationship: 'Guardian'
      }
    });

    expect(inviteRes.statusCode).toBe(201);
    const token = inviteRes.json().inviteToken as string;

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/parent/invites/accept',
      headers: parentAuth.headers,
      payload: { token }
    });

    expect(acceptRes.statusCode).toBe(200);

    const studentsRes = await app.inject({
      method: 'GET',
      url: '/parent/students',
      headers: parentAuth.headers
    });

    expect(studentsRes.statusCode).toBe(200);
    expect(studentsRes.json().items).toHaveLength(1);
    expect(studentsRes.json().items[0].id).toBe(student.id);

    await app.close();
  });

  it('enforces premium vault tier and secure asset delivery', async () => {
    const app = await buildApp();

    const basicStudent = await createStudent({ fullName: 'Basic Tier Student' });
    const premiumStudent = await createStudent({ fullName: 'Premium Tier Student' });

    const basicUserRes = await pool.query(
      `insert into users (email, role, student_id, tier)
       values ($1, 'STUDENT', $2, 'BASIC')
       returning id`,
      ['basic-tier@test.local', basicStudent.id]
    );

    const premiumUserRes = await pool.query(
      `insert into users (email, role, student_id, tier)
       values ($1, 'STUDENT', $2, 'PREMIUM')
       returning id`,
      ['premium-tier@test.local', premiumStudent.id]
    );

    const resourceRes = await pool.query(
      `insert into vault_resources (title, description, category, body_markdown, minimum_tier, is_published, is_public_preview, created_by_user_id)
       values ($1, $2, $3, $4, 'PREMIUM', true, false, $5)
       returning id`,
      [
        'Premium Calculus Notes',
        'Advanced worked examples',
        'Calculus',
        'Premium derivative patterns and integration strategies.',
        premiumUserRes.rows[0].id
      ]
    );

    await pool.query(
      `insert into vault_access_rules (resource_id, role, is_allowed)
       values ($1, 'STUDENT', true)`,
      [resourceRes.rows[0].id]
    );

    const assetRes = await pool.query(
      `insert into vault_assets (resource_id, file_name, mime_type, content_text)
       values ($1, $2, $3, $4)
       returning id`,
      [resourceRes.rows[0].id, 'calculus-guide.txt', 'text/plain; charset=utf-8', 'Premium file body']
    );

    const basicAuth = await loginWithMagicToken(app, await issueMagicToken(basicUserRes.rows[0].id));
    const premiumAuth = await loginWithMagicToken(app, await issueMagicToken(premiumUserRes.rows[0].id));

    const basicDetail = await app.inject({
      method: 'GET',
      url: `/vault/${resourceRes.rows[0].id}`,
      headers: basicAuth.headers
    });
    expect(basicDetail.statusCode).toBe(403);
    expect(basicDetail.json().error).toBe('vault_tier_upgrade_required');

    const premiumDetail = await app.inject({
      method: 'GET',
      url: `/vault/${resourceRes.rows[0].id}`,
      headers: premiumAuth.headers
    });
    expect(premiumDetail.statusCode).toBe(200);
    expect(premiumDetail.json().resource.locked).toBe(false);

    const basicAsset = await app.inject({
      method: 'GET',
      url: `/vault/assets/${assetRes.rows[0].id}`,
      headers: basicAuth.headers
    });
    expect(basicAsset.statusCode).toBe(403);

    const premiumAsset = await app.inject({
      method: 'GET',
      url: `/vault/assets/${assetRes.rows[0].id}`,
      headers: premiumAuth.headers
    });
    expect(premiumAsset.statusCode).toBe(200);
    expect(premiumAsset.body).toContain('Premium file body');

    await app.close();
  });
});
