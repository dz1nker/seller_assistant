import { createHash, randomBytes } from 'node:crypto';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function newTokens() {
  const access = randomBytes(32).toString('base64url');
  const refresh = randomBytes(32).toString('base64url');
  return { access, refresh, accessHash: tokenHash(access), refreshHash: tokenHash(refresh) };
}
export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 7 * 24 * 60 * 60;
