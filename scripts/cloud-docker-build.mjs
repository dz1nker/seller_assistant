// The cloud host supplies its trusted proxy and public CA. Forward them without
// copying credentials or CA files into the build context/image. Ordinary local
// development can use `docker compose --profile app build` directly.
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const ca = process.env.NODE_EXTRA_CA_CERTS ?? process.env.CODEX_PROXY_CERT;
const flags = [];
const env = { ...process.env };
if (proxy) {
  const host = new URL(proxy).hostname;
  const address = await lookup(host, { family: 4 });
  flags.push('--add-host', `${host}:${address.address}`);
  // Predefined Docker proxy arguments are excluded from build history/cache.
  Object.assign(env, { http_proxy: proxy, https_proxy: proxy });
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) {
    if (env[name]) flags.push('--build-arg', name);
  }
}
if (ca && existsSync(ca)) flags.push('--secret', `id=proxy_ca,src=${ca}`);
env.DOCKER_CONFIG ??= path.resolve('.local/docker');
mkdirSync(env.DOCKER_CONFIG, { recursive: true });
const supported = ['api', 'web', 'telegram-gateway'];
const targets = process.argv.slice(2);
if (targets.some(target => !supported.includes(target))) throw new Error('Unknown Docker target');
for (const target of targets.length ? targets : supported) {
  const args = ['build', '--network=host', ...flags, '--target', target, '-t', `sales-copilot-${target}`, '.'];
  const result = spawnSync('docker', args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
