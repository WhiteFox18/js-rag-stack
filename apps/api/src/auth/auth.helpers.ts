import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type {
  AnonymousPrincipal,
  RequestPrincipal,
} from '../common/models/request-principal';
import type { User } from '../generated/prisma/client';
import type { AuthUserDto } from './models/auth-response.dto';
import type { SessionResponseDto } from './models/session-response.dto';
import type { ToSessionResponseParams } from './auth.types';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAnonymousPrincipal(
  principal: RequestPrincipal | undefined,
): AnonymousPrincipal | undefined {
  return principal?.type === 'anonymous' ? principal : undefined;
}

export function toAuthUser(user: User): AuthUserDto {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

export function toSessionResponse({
  session,
  currentSessionId,
}: ToSessionResponseParams): SessionResponseDto {
  return {
    id: session.id,
    userAgent: session.user_agent,
    current: session.id === currentSessionId,
    createdAt: session.created_at.toISOString(),
    lastUsedAt: session.last_used_at.toISOString(),
    expiresAt: session.expires_at.toISOString(),
  };
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getAuthenticatedPrincipal(
  request: Request,
): Extract<NonNullable<Request['principal']>, { type: 'authenticated' }> {
  if (request.principal?.type !== 'authenticated') {
    throw new UnauthorizedException('Authentication is required.');
  }
  return request.principal;
}
