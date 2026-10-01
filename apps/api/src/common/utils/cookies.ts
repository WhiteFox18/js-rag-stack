import { UnauthorizedException } from '@nestjs/common';
import type { GetCookieParams } from './cookies.types';

export function getCookie({ request, name }: GetCookieParams): string {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];

  if (typeof value !== 'string') {
    throw new UnauthorizedException('Refresh token is required.');
  }
  return value;
}
