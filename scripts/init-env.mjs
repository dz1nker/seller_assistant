import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env already exists; preserved.');
} else {
  const password = randomBytes(24).toString('hex');
  const redisPassword = randomBytes(24).toString('hex');
  let content = readFileSync('.env.example', 'utf8');
  content = content.replace('sales:CHANGE_ME@', `sales:${password}@`)
    .replace('POSTGRES_PASSWORD=CHANGE_ME', `POSTGRES_PASSWORD=${password}`)
    .replace('REDIS_PASSWORD=CHANGE_ME', `REDIS_PASSWORD=${redisPassword}`)
    .replace('redis://:CHANGE_ME@', `redis://:${redisPassword}@`);
  writeFileSync('.env', content, { mode: 0o600, flag: 'wx' });
  console.log('Created .env with random local service passwords. No application account was created.');
}
