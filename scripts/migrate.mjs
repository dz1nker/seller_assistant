import 'dotenv/config';
import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Transactional SQL runner. Does not depend on Prisma's separately downloaded native CLI engine.
// Keep this migration ledger; do not mix Prisma Migrate commands against the same database.
export async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('sales_copilot_migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS "_sales_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
    const directory = path.resolve('packages/database/prisma/migrations');
    const entries = (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of entries) {
      const sql = await readFile(path.join(directory, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM "_sales_migrations" WHERE name=$1', [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new Error('An applied migration was modified; restore it and add a new migration.');
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_sales_migrations" (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
        console.log(`Applied migration ${name}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    console.log('Database migrations are current.');
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('sales_copilot_migrations'))").catch(() => {});
    await client.end();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  migrate().catch(() => { console.error('Migration failed; transaction rolled back. Check database access and migration history.'); process.exitCode = 1; });
}
