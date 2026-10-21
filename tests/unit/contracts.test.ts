import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, workspacePatchSchema } from '@sales/shared';
describe('Public API input boundaries', () => {
  const registration = { email: 'owner@example.com', password: 'unique-password-123', name: 'Анна', workspaceName: 'Мой бизнес' };
  it('normalizes email before identity lookup', () => {
    expect(loginSchema.parse({ email: 'Owner@Example.COM', password: registration.password }).email).toBe('owner@example.com');
  });
  it('rejects too-short passwords', () => {
    expect(registerSchema.safeParse({ ...registration, password: 'short' }).success).toBe(false);
  });
  it('rejects UTF-8 passwords exceeding bcrypt byte limit', () => {
    expect(registerSchema.safeParse({ ...registration, password: 'ю'.repeat(40) }).success).toBe(false);
  });
  it('does not accept role or tenant injection during signup', () => {
    expect(registerSchema.safeParse({ ...registration, role: 'ADMIN' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...registration, workspaceId: 'other' }).success).toBe(false);
  });
  it('rejects changing internal workspace identity', () => {
    expect(workspacePatchSchema.safeParse({ name: 'Бизнес', description: '', timezone: 'Etc/UTC', id: 'another-workspace' }).success).toBe(false);
  });
  it('validates time zones and business limits', () => {
    expect(workspacePatchSchema.safeParse({ name: 'Бизнес', description: '', timezone: 'Moon/Sea' }).success).toBe(false);
    expect(workspacePatchSchema.safeParse({ name: 'Бизнес', description: 'x'.repeat(4001), timezone: 'Etc/UTC' }).success).toBe(false);
    expect(workspacePatchSchema.safeParse({ name: 'Бизнес', description: 'Консультации', timezone: 'Europe/Minsk' }).success).toBe(true);
  });
});
