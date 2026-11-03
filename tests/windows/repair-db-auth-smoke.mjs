// Isolated Docker fixture: no host port, named volume or application DB is used.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const name = `sales-auth-repair-test-${randomBytes(6).toString('hex')}`;
const currentPassword = randomBytes(24).toString('hex');
const oldPassword = randomBytes(24).toString('hex');
mkdirSync('.local', { recursive: true });
const root = mkdtempSync(path.resolve('.local/repair-db-test-'));
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000 });
  // Never print commands' raw output or credentials, even when an assertion fails.
  assert.ok(!`${r.stdout}${r.stderr}`.includes(currentPassword), 'Current password must not appear in logs');
  assert.ok(!`${r.stdout}${r.stderr}`.includes(oldPassword), 'Previous password must not appear in logs');
  return r;
}
function successful(args, input) {
  const r = docker(args, input);assert.equal(r.status, 0, 'Docker fixture operation must succeed');return r;
}
const tcpQuery = 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -h "$HOSTNAME" -U "$POSTGRES_USER" -d postgres -tAc "SELECT marker FROM repair_preserve"';
try {
  const env = path.join(root, 'fixture.env');
  writeFileSync(env, `POSTGRES_USER=repair_test\nPOSTGRES_PASSWORD=${currentPassword}\n`, { mode: 0o600 });
  successful(['run', '--pull=never', '--rm', '-d', '--name', name, '--env-file', env, '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', 'postgres:17-alpine']);
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'repair_test']).status === 0) { ready = true;break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Isolated PostgreSQL must become ready');
  successful(['exec', name, 'psql', '-X', '-U', 'repair_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE TABLE repair_preserve(marker text); INSERT INTO repair_preserve VALUES ('preserved');"]);
  // Simulate an old database volume whose password differs from its current env.
  successful(['exec', '-i', name, 'psql', '-X', '-w', '-U', 'repair_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', '\\password'], `${oldPassword}\n${oldPassword}\n`);
  assert.notEqual(docker(['exec', name, 'sh', '-c', tcpQuery]).status, 0, 'Current env credentials must initially fail');
  const repair = readFileSync('scripts/repair-db-auth.sh', 'utf8');
  successful(['exec', '-i', name, 'sh'], repair);
  assert.equal(successful(['exec', name, 'sh', '-c', tcpQuery]).stdout.trim(), 'preserved');
  const crlfRepair = successful(['exec', '-i', name, 'sh', '-c', "tr -d '\\r' | sh"], repair.replace(/\r?\n/g, '\r\n'));
  assert.ok(crlfRepair.stdout.includes('Database role password now matches'), 'PowerShell CRLF input must execute the repair');
  assert.equal(successful(['exec', name, 'sh', '-c', tcpQuery]).stdout.trim(), 'preserved');
  successful(['logs', name]);
  console.log('Passed: mismatched credentials repaired, data preserved, repeat safe, no passwords logged.');
} finally {
  docker(['rm', '-f', name]);
  rmSync(root, { recursive: true, force: true });
}
