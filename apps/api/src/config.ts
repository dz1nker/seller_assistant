import { Injectable } from '@nestjs/common';
import { z } from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  REDIS_URL: z.url().refine(value => ['redis:', 'rediss:'].includes(new URL(value).protocol)),
  WEB_ORIGIN: z.url().refine(value => new URL(value).origin === value, 'Use an exact origin without trailing slash'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
@Injectable()
export class AppConfig {
  readonly values = envSchema.parse(process.env);
  constructor() {
    if (this.values.NODE_ENV === 'production' &&
      (this.values.COOKIE_SECURE !== 'true' || !this.values.WEB_ORIGIN.startsWith('https://'))) {
      throw new Error('Production requires HTTPS WEB_ORIGIN and COOKIE_SECURE=true');
    }
  }
  get secureCookies() { return this.values.COOKIE_SECURE === 'true'; }
}
