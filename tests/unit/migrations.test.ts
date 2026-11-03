import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const pg = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() }));
vi.mock('pg', () => ({ Client: class { connect = pg.connect; query = pg.query; end = pg.end; } }));
import { migrate, migrationDiagnostic, MigrationFailure } from '../../scripts/migrate.mjs';
const fixtureUrl = 'postgresql://test-user:private-fixture-password@database/example';
beforeEach(() => {
  vi.resetAllMocks();
  pg.connect.mockResolvedValue(undefined);
  pg.query.mockResolvedValue({ rows: [] });
  pg.end.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
describe('Safe migration startup diagnostics', () => {
  it('reports authentication failures without logging the password and closes the client', async () => {
    pg.connect.mockRejectedValueOnce(Object.assign(new Error(`password=${fixtureUrl}`), { code: '28P01', detail: fixtureUrl }));
    let failure: unknown;
    try { await migrate(fixtureUrl); } catch (error) { failure = error; }
    expect(migrationDiagnostic(failure)).toMatchObject({ code: '28P01', phase: 'connect' });
    expect(JSON.stringify(migrationDiagnostic(failure))).not.toContain('private-fixture-password');
    expect(pg.end).toHaveBeenCalledOnce();
    expect(pg.query).not.toHaveBeenCalled();
  });
  it('reports checksum mismatches and never overwrites applied migration history', async () => {
    pg.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT checksum') ? [{ checksum: 'different-checksum' }] : [] }));
    let failure: unknown;
    try { await migrate(fixtureUrl); } catch (error) { failure = error; }
    expect(migrationDiagnostic(failure)).toMatchObject({ code: 'CHECKSUM_MISMATCH', phase: 'checksum', migration: '202610210001_foundation' });
    const statements = pg.query.mock.calls.map(call => call[0]);
    expect(statements).not.toContain('BEGIN');
    expect(statements.some((s: string) => /^(INSERT|UPDATE|DELETE) /.test(s))).toBe(false);
    expect(pg.end).toHaveBeenCalledOnce();
  });
  it('rolls back a failed migration and preserves its root error if rollback also fails', async () => {
    let applying = false;
    pg.query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') applying = true;
      else if (sql === 'ROLLBACK') { applying = false; throw new Error('connection closed'); }
      else if (applying) throw Object.assign(new Error(fixtureUrl), { code: '42703' });
      return { rows: [] };
    });
    let failure: unknown;
    try { await migrate(fixtureUrl); } catch (error) { failure = error; }
    expect(migrationDiagnostic(failure)).toMatchObject({ code: '42703', phase: 'apply', migration: '202610210001_foundation' });
    expect(pg.query.mock.calls.map(call => call[0])).toContain('ROLLBACK');
    expect(JSON.stringify(migrationDiagnostic(failure))).not.toContain(fixtureUrl);
    expect(pg.end).toHaveBeenCalledOnce();
  });
  it('retains unlisted SQLSTATE codes but redacts arbitrary error fields', () => {
    expect(migrationDiagnostic(new MigrationFailure({ code: '42830', message: fixtureUrl }, 'apply', '202610280001_mvp')).code).toBe('42830');
    const result = migrationDiagnostic({ code: fixtureUrl, phase: fixtureUrl, migration: fixtureUrl, message: fixtureUrl, detail: fixtureUrl, cause: new Error(fixtureUrl) });
    expect(result).toMatchObject({ code: 'MIGRATION_FAILED', phase: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('private-fixture-password');
  });
  it('reports a missing URL before opening any database connection', async () => {
    await expect(migrate('')).rejects.toMatchObject({ code: 'DATABASE_URL_MISSING', phase: 'configuration' });
    expect(pg.connect).not.toHaveBeenCalled();
  });
  it('runs the CLI from a path with spaces and exits with a safe error', () => {
    mkdirSync('.local', { recursive: true });
    const root = mkdtempSync(path.resolve('.local/migration cli test '));
    try {
      const entry = path.join(root, 'migrate.mjs');
      copyFileSync('scripts/migrate.mjs', entry);
      const result = spawnSync(process.execPath, [entry], { cwd: root, env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000 });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DATABASE_URL_MISSING');
      expect(result.stderr).not.toContain('transaction rolled back');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
