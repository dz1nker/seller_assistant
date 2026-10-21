import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../apps/api/src/config';
afterEach(() => vi.unstubAllEnvs());
function validEnv() {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  vi.stubEnv('WEB_ORIGIN', 'https://sales.example.com');
  vi.stubEnv('COOKIE_SECURE', 'true');
  vi.stubEnv('NODE_ENV', 'production');
}
describe('Production configuration', () => {
  it('rejects production without secure cookies', () => {
    validEnv(); vi.stubEnv('COOKIE_SECURE', 'false');
    expect(() => new AppConfig()).toThrow('Production requires HTTPS');
  });
  it('rejects production over HTTP', () => {
    validEnv(); vi.stubEnv('WEB_ORIGIN', 'http://sales.example.com');
    expect(() => new AppConfig()).toThrow('Production requires HTTPS');
  });
  it('accepts exact HTTPS origin and secure cookies', () => {
    validEnv(); expect(new AppConfig().secureCookies).toBe(true);
  });
});
