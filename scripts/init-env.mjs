import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

// Existing service passwords must survive upgrades: database volumes use them.
const exists = existsSync('.env');
let content = readFileSync(exists ? '.env' : '.env.example', 'utf8');
if (!exists) {
  const password = randomBytes(24).toString('hex');
  const redisPassword = randomBytes(24).toString('hex');
  content = content.replace('sales:CHANGE_ME@', `sales:${password}@`)
    .replace('POSTGRES_PASSWORD=CHANGE_ME', `POSTGRES_PASSWORD=${password}`)
    .replace('REDIS_PASSWORD=CHANGE_ME', `REDIS_PASSWORD=${redisPassword}`)
    .replace('redis://:CHANGE_ME@', `redis://:${redisPassword}@`);
}
for (const name of ['GATEWAY_TOKEN', 'SESSION_MASTER_KEY']) {
  const pattern = new RegExp(`^${name}=(.*)$`, 'm');
  const match = content.match(pattern);
  if (match && match[1].trim() && !['""', "''"].includes(match[1].trim())) continue;
  const value = process.env[name] || randomBytes(32).toString('hex');
  if(!(name==='SESSION_MASTER_KEY'?/^[a-f0-9]{64}$/i:/^[a-zA-Z0-9_-]{32,256}$/).test(value)) throw new Error(`Invalid ${name} binding`);
  content = match ? content.replace(pattern, `${name}=${value}`) : `${content.trimEnd()}\n${name}=${value}\n`;
}
writeFileSync('.env', content, { mode: 0o600, flag: exists ? 'w' : 'wx' });
chmodSync('.env',0o600);
console.log(exists ? 'Environment upgraded; existing values preserved.' : 'Created local environment with random service credentials.');
