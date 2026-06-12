import { createHash } from 'node:crypto';

export function hashAnonymousToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
