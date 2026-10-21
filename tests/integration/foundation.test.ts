import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/src/bootstrap';
import { Database, Cache } from '../../apps/api/src/infrastructure';
import { tokenHash } from '../../apps/api/src/auth/tokens';
import { migrate } from '../../scripts/migrate.mjs';

type Identity = { userId: string; workspaceId: string; cookies: string[]; email: string };
let app: INestApplication;
let db: Database;
let cache: Cache;
const identities: Identity[] = [];
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const password = 'Test-only-password-123!';
const cookies = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[]).map(value => value.split(';')[0]!);
const secret = (identity: Identity, name: string) => identity.cookies.find(value => value.startsWith(`${name}=`))!.split('=')[1]!;
const patch = (name = 'Обновлённый бизнес') => ({ name, description: 'Консультации для экспертов', timezone: 'Europe/Minsk' });
async function register(): Promise<Identity> {
  const email = `${randomUUID()}@example.test`;
  const res = await request(app.getHttpServer()).post('/auth/register').set('Origin', origin)
    .send({ email, password, name: 'Анна', workspaceName: `Бизнес ${email.slice(0, 8)}` }).expect(201);
  const identity = { userId: res.body.id as string, workspaceId: res.body.workspaceId as string, cookies: cookies(res), email };
  identities.push(identity);
  return identity;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]*_test$/.test(dbName)) throw new Error('Unsafe integration database name');
  const admin = new URL(url); admin.pathname = '/postgres';
  const pg = new Client({ connectionString: admin.toString() });
  await pg.connect();
  try {
    const found = await pg.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (!found.rowCount) await pg.query(`CREATE DATABASE "${dbName}"`);
  } finally { await pg.end(); }
  await migrate(url.toString());
  await migrate(url.toString()); // Verify repeatability without resets or data loss.
  app = await createApp(); await app.init();
  db = app.get(Database); cache = app.get(Cache);
});
afterAll(async () => {
  if (db) {
    await db.workspace.deleteMany({ where: { id: { in: identities.map(i => i.workspaceId) } } });
    await db.user.deleteMany({ where: { id: { in: identities.map(i => i.userId) } } });
  }
  await app?.close();
});

describe('Foundation with real PostgreSQL and Redis', () => {
  it('reports dependency readiness', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });
  it('denies unauthenticated workspace access', async () => {
    await request(app.getHttpServer()).get('/workspaces/current').expect(401);
  });
  it('returns controlled client errors for malformed JSON and oversized bodies', async () => {
    await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send('{broken').expect(400);
    await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).send({ email: 'x'.repeat(34000) }).expect(413);
  });
  it('creates owner, workspace, seven stages and secure session without exposing hashes', async () => {
    const owner = await register();
    const res = await request(app.getHttpServer()).get('/workspaces/current').set('Cookie', owner.cookies).expect(200);
    expect(res.body.members).toEqual([{ userId: owner.userId, name: 'Анна', role: 'OWNER' }]);
    expect(res.body.pipelines[0].stages).toHaveLength(7);
    expect(res.body.pipelines[0].stages.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const user = await db.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const session = await db.session.findUniqueOrThrow({ where: { accessHash: tokenHash(secret(owner, 'sc_access')) } });
    expect(session.accessHash).not.toBe(secret(owner, 'sc_access'));
    expect(session.refreshHash).not.toBe(secret(owner, 'sc_refresh'));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const login = await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).send({ email: owner.email, password }).expect(200);
    expect((login.headers['set-cookie'] as unknown as string[]).every((value: string) => value.includes('HttpOnly') && value.includes('SameSite=Strict') && value.includes('Path=/api'))).toBe(true);
    expect(login.body).not.toHaveProperty('passwordHash');
  });
  it('rejects duplicate registration and leaves no orphan workspace', async () => {
    const owner = await register();
    const before = await db.workspace.count();
    await request(app.getHttpServer()).post('/auth/register').set('Origin', origin)
      .send({ email: owner.email.toUpperCase(), password, name: 'Другой', workspaceName: 'Другой бизнес' }).expect(409);
    expect(await db.workspace.count()).toBe(before);
  });
  it('rejects wrong passwords with a generic error', async () => {
    const owner = await register();
    const res = await request(app.getHttpServer()).post('/auth/login').set('Origin', origin)
      .send({ email: owner.email, password: 'incorrect-password-123' }).expect(401);
    expect(res.body.message).toBe('Неверный email или пароль');
  });
  it('ignores a caller-supplied tenant header and query parameter', async () => {
    const [a, b] = await Promise.all([register(), register()]);
    const res = await request(app.getHttpServer()).get(`/workspaces/current?workspaceId=${b.workspaceId}`)
      .set('Cookie', a.cookies).set('X-Workspace-Id', b.workspaceId).expect(200);
    expect(res.body.id).toBe(a.workspaceId);
    expect(res.body.members.some((m: { userId: string }) => m.userId === b.userId)).toBe(false);
  });
  it('updates only the authenticated tenant and writes an audit entry', async () => {
    const [a, b] = await Promise.all([register(), register()]);
    const original = await db.workspace.findUniqueOrThrow({ where: { id: b.workspaceId } });
    await request(app.getHttpServer()).patch('/workspaces/current').set('Origin', origin).set('Cookie', a.cookies).send(patch()).expect(200);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: b.workspaceId } })).name).toBe(original.name);
    expect(await db.auditLog.count({ where: { workspaceId: a.workspaceId, action: 'workspace.updated' } })).toBe(1);
  });
  it('rejects injected identity fields, unknown fields and invalid time zones', async () => {
    const a = await register();
    for (const body of [{ ...patch(), workspaceId: randomUUID() }, { ...patch(), role: 'OWNER' }, { ...patch(), timezone: 'Invalid/Zone' }]) {
      await request(app.getHttpServer()).patch('/workspaces/current').set('Origin', origin).set('Cookie', a.cookies).send(body).expect(400);
    }
  });
  it('blocks CSRF on authenticated writes, login and logout', async () => {
    const a = await register();
    await request(app.getHttpServer()).patch('/workspaces/current').set('Origin', 'https://evil.example').set('Cookie', a.cookies).send(patch()).expect(403);
    await request(app.getHttpServer()).post('/auth/login').send({ email: a.email, password }).expect(403);
    await request(app.getHttpServer()).post('/auth/logout').set('Origin', 'https://evil.example').set('Cookie', a.cookies).expect(403);
  });
  it('enforces live membership roles: member cannot edit, admin can', async () => {
    const a = await register();
    const where = { workspaceId_userId: { workspaceId: a.workspaceId, userId: a.userId } };
    await db.workspaceMember.update({ where, data: { role: 'MEMBER' } });
    await request(app.getHttpServer()).patch('/workspaces/current').set('Origin', origin).set('Cookie', a.cookies).send(patch()).expect(403);
    await db.workspaceMember.update({ where, data: { role: 'ADMIN' } });
    await request(app.getHttpServer()).patch('/workspaces/current').set('Origin', origin).set('Cookie', a.cookies).send(patch()).expect(200);
  });
  it('rotates refresh tokens once and immediately invalidates old access', async () => {
    const a = await register();
    const before = await db.session.findUniqueOrThrow({ where: { refreshHash: tokenHash(secret(a, 'sc_refresh')) } });
    const refreshed = await request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', a.cookies).expect(204);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', a.cookies).expect(401);
    await request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', a.cookies).expect(401);
    const fresh = cookies(refreshed);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', fresh).expect(200);
    const after = await db.session.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.refreshExpiresAt).toEqual(before.refreshExpiresAt);
  });
  it('allows exactly one winner when refresh requests race', async () => {
    const a = await register();
    const result = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', a.cookies)));
    expect(result.map(r => r.status).sort()).toEqual([204, 401]);
  });
  it('allows refresh after access expiry, denies absolute refresh expiry', async () => {
    const a = await register();
    await db.session.updateMany({ where: { userId: a.userId }, data: { accessExpiresAt: new Date(0) } });
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', a.cookies).expect(401);
    const response = await request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', a.cookies).expect(204);
    await db.session.updateMany({ where: { userId: a.userId }, data: { refreshExpiresAt: new Date(0) } });
    await request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', cookies(response)).expect(401);
  });
  it('revokes the entire session on logout', async () => {
    const a = await register();
    const result = await request(app.getHttpServer()).post('/auth/logout').set('Origin', origin).set('Cookie', a.cookies).expect(204);
    expect(result.headers['set-cookie']).toHaveLength(2);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', a.cookies).expect(401);
    await request(app.getHttpServer()).post('/auth/refresh').set('Origin', origin).set('Cookie', a.cookies).expect(401);
  });
  it('revokes access when membership is deleted', async () => {
    const a = await register();
    await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: a.workspaceId, userId: a.userId } } });
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', a.cookies).expect(401);
    expect(await db.session.count({ where: { userId: a.userId } })).toBe(0);
  });
  it('rate-limits authentication with an expiring Redis counter', async () => {
    const email = `${randomUUID()}@example.test`;
    for (let n = 0; n < 5; n++) await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).send({ email, password }).expect(401);
    await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).send({ email, password }).expect(429);
  });
  it('fails closed on rate-limit store failure and recovers', async () => {
    const spy = vi.spyOn(cache, 'increment').mockRejectedValueOnce(new Error('test outage'));
    try { await request(app.getHttpServer()).get('/workspaces/current').expect(503); } finally { spy.mockRestore(); }
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });
});
