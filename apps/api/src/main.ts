import { config } from 'dotenv';
import path from 'node:path';
import { AppConfig } from './config';
import { createApp } from './bootstrap';
config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
async function main() {
  const app = await createApp();
  await app.listen(app.get(AppConfig).values.API_PORT, '0.0.0.0');
}
main().catch(() => { console.error('API startup failed. Check environment configuration and PostgreSQL/Redis readiness.'); process.exitCode = 1; });
