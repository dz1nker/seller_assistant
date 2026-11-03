import 'dotenv/config';
import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only fixed explanations are logged: database errors can contain credentials,
// connection URLs, SQL or user data in their message/detail/cause.
const explanations = {
  DATABASE_URL_MISSING: 'DATABASE_URL is missing.',
  CHECKSUM_MISMATCH: 'An applied migration differs from its recorded checksum. Restore its original file; do not reset the ledger.',
  '28P01': 'PostgreSQL rejected the password. Check the original .env used to create this database volume.',
  '28000': 'PostgreSQL rejected authentication. Check the database access configuration.',
  '3D000': 'The configured PostgreSQL database does not exist.',
  '42501': 'The database role lacks permission to apply migrations.',
  '42P07': 'A migration table already exists but is not recorded as applied. Check the migration history.',
  '42710': 'A migration object already exists. Check the migration history.',
  '42701': 'A migration column already exists. Check the migration history.',
  '42703': 'A migration references a missing column.',
  '42P01': 'A migration references a missing table.',
  '42601': 'A migration contains invalid SQL syntax.',
  '23503': 'A migration conflicts with an existing foreign key.',
  '23505': 'A migration conflicts with an existing unique value.',
  '23502': 'A migration conflicts with an existing null value.',
  '23514': 'A migration conflicts with an existing check constraint.',
  '57P03': 'PostgreSQL is not ready to accept connections.',
  ECONNREFUSED: 'Cannot connect to PostgreSQL. Check the database host and port.',
  ETIMEDOUT: 'The PostgreSQL connection timed out.',
  ENOTFOUND: 'The PostgreSQL host could not be resolved.',
  EAI_AGAIN: 'The PostgreSQL host could not be resolved temporarily.',
  ENOENT: 'A required migration file or directory is missing.',
  MIGRATION_FAILED: 'Migration failed. Inspect the indicated phase and migration; no credentials or raw SQL are logged.',
};
const phases = new Set(['configuration', 'connect', 'lock', 'history', 'read', 'checksum', 'apply']);
export function migrationDiagnostic(error) {
  const rawCode = error?.code;
  const code = typeof rawCode === 'string' && (Object.hasOwn(explanations, rawCode) || /^[0-9A-Z]{5}$/.test(rawCode)) ? rawCode : 'MIGRATION_FAILED';
  const phase = phases.has(error?.phase) ? error.phase : 'unknown';
  const migration = typeof error?.migration === 'string' && /^\d{12,14}_[a-z0-9_]{1,100}$/.test(error.migration) ? error.migration : undefined;
  return { code, phase, ...(migration ? { migration } : {}), message: explanations[code] ?? explanations.MIGRATION_FAILED };
}
export class MigrationFailure extends Error {
  constructor(error, phase, migration) {
    super('Database migration failed.', { cause: error });
    this.name = 'MigrationFailure';
    this.code = migrationDiagnostic(error).code;
    this.phase = phase;
    this.migration = migration;
  }
}

// Keep this immutable checksum ledger; do not mix Prisma Migrate commands here.
export async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new MigrationFailure({ code: 'DATABASE_URL_MISSING' }, 'configuration');
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  let phase = 'connect';
  let migration;
  let locked = false;
  let transaction = false;
  try {
    await client.connect();
    phase = 'lock';
    await client.query("SELECT pg_advisory_lock(hashtext('sales_copilot_migrations'))");
    locked = true;
    phase = 'history';
    await client.query('CREATE TABLE IF NOT EXISTS "_sales_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
    phase = 'read';
    const directory = path.resolve('packages/database/prisma/migrations');
    const entries = (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of entries) {
      migration = name;
      phase = 'read';
      const sql = await readFile(path.join(directory, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      phase = 'checksum';
      const previous = await client.query('SELECT checksum FROM "_sales_migrations" WHERE name=$1', [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw Object.assign(new Error('An applied migration was modified.'), { code: 'CHECKSUM_MISMATCH' });
        continue;
      }
      phase = 'apply';
      await client.query('BEGIN');
      transaction = true;
      await client.query(sql);
      await client.query('INSERT INTO "_sales_migrations" (name, checksum) VALUES ($1, $2)', [name, checksum]);
      await client.query('COMMIT');
      transaction = false;
      console.log(`Applied migration ${name}`);
    }
    console.log('Database migrations are current.');
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw new MigrationFailure(error, phase, migration);
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('sales_copilot_migrations'))").catch(() => {});
    await client.end().catch(() => {});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch(error => {
    console.error(`Migration failed: ${JSON.stringify(migrationDiagnostic(error))}`);
    process.exitCode = 1;
  });
}
