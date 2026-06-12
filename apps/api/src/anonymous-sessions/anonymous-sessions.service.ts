import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppEnvironment } from '../config/environment.schema';
import type { AnonymousPrincipal } from '../common/models/request-principal';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnonymousSessionsService {
  readonly cookie_name = 'anonymous_session';
  private readonly ttl_ms: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {
    this.ttl_ms = parseDurationMs(
      config.get('ANONYMOUS_SESSION_TTL', { infer: true }),
    );
  }

  async create(response: Response): Promise<AnonymousPrincipal> {
    const raw_token = randomBytes(32).toString('base64url');
    const expires_at = new Date(Date.now() + this.ttl_ms);
    const session = await this.prisma.anonymousSession.create({
      data: {
        token_hash: hashToken(raw_token),
        expires_at,
      },
    });

    response.cookie(this.cookie_name, raw_token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
      expires: expires_at,
    });

    return {
      type: 'anonymous',
      anonymous_session_id: session.id,
    };
  }

  async resolvePrincipal(
    raw_token: string,
  ): Promise<AnonymousPrincipal | undefined> {
    const token_hash = hashToken(raw_token);
    const now = new Date();
    const session = await this.prisma.anonymousSession.findFirst({
      where: {
        token_hash,
        expires_at: { gt: now },
      },
    });

    if (!session) {
      return undefined;
    }

    await this.prisma.anonymousSession.update({
      where: { id: session.id },
      data: { last_seen_at: now },
    });

    return {
      type: 'anonymous',
      anonymous_session_id: session.id,
    };
  }

  async invalidate(
    anonymous_session_id: string,
    response: Response,
  ): Promise<void> {
    await this.prisma.anonymousSession.deleteMany({
      where: { id: anonymous_session_id },
    });
    response.clearCookie(this.cookie_name, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
    });
  }
}

export function hashToken(raw_token: string): string {
  return createHash('sha256').update(raw_token).digest('hex');
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([dhm])$/.exec(value);

  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unit_ms = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return amount * unit_ms;
}
