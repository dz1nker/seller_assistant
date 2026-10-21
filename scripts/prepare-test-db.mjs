import { Client } from 'pg';
import { migrate } from './migrate.mjs';
const url = new URL(process.env.DATABASE_URL ?? '');
const name = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*_test$/.test(name)) throw new Error('Only a dedicated *_test database is allowed');
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!result.rowCount) await client.query(`CREATE DATABASE "${name}"`);
} finally { await client.end(); }
await migrate(url.toString());
