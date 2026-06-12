import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppEnvironment } from '../config/environment.schema';
import type { AnonymousPrincipal } from '../common/models/request-principal';
import { parseDurationMs } from '../common/utils/duration';
import { hashAnonymousToken } from './anonymous-sessions.helpers';
import { AnonymousSessionsRepository } from './anonymous-sessions.repository';
import type { InvalidateAnonymousSessionParams } from './anonymous-sessions.types';

@Injectable()
export class AnonymousSessionsService {
  readonly cookieName = 'anonymous_session';
  private readonly ttlMs: number;

  constructor(
    private readonly repository: AnonymousSessionsRepository,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {
    this.ttlMs = parseDurationMs(
      config.get('ANONYMOUS_SESSION_TTL', { infer: true }),
    );
  }

  async create(response: Response): Promise<AnonymousPrincipal> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const session = await this.repository.create({
      tokenHash: hashAnonymousToken(rawToken),
      expiresAt,
    });

    response.cookie(this.cookieName, rawToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
      expires: expiresAt,
    });

    return {
      type: 'anonymous',
      anonymous_session_id: session.id,
    };
  }

  async resolvePrincipal(
    rawToken: string,
  ): Promise<AnonymousPrincipal | undefined> {
    const tokenHash = hashAnonymousToken(rawToken);
    const now = new Date();
    const session = await this.repository.findActiveByTokenHash({
      tokenHash,
      now,
    });

    if (!session) {
      return undefined;
    }

    await this.repository.touch({ sessionId: session.id, now });

    return {
      type: 'anonymous',
      anonymous_session_id: session.id,
    };
  }

  async invalidate({
    anonymousSessionId,
    response,
  }: InvalidateAnonymousSessionParams): Promise<void> {
    await this.repository.delete(anonymousSessionId);
    this.clearCookie(response);
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
    });
  }
}
