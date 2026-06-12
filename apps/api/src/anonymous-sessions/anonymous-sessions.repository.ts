import { Injectable } from '@nestjs/common';
import type { AnonymousSession, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateAnonymousSessionParams,
  FindActiveAnonymousSessionParams,
  TouchAnonymousSessionParams,
} from './anonymous-sessions.types';

@Injectable()
export class AnonymousSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create({
    tokenHash,
    expiresAt,
  }: CreateAnonymousSessionParams): Promise<AnonymousSession> {
    return this.prisma.anonymousSession.create({
      data: { token_hash: tokenHash, expires_at: expiresAt },
    });
  }

  findActiveByTokenHash({
    tokenHash,
    now,
  }: FindActiveAnonymousSessionParams): Promise<AnonymousSession | null> {
    return this.prisma.anonymousSession.findFirst({
      where: { token_hash: tokenHash, expires_at: { gt: now } },
    });
  }

  touch({
    sessionId,
    now,
  }: TouchAnonymousSessionParams): Promise<AnonymousSession> {
    return this.prisma.anonymousSession.update({
      where: { id: sessionId },
      data: { last_seen_at: now },
    });
  }

  delete(sessionId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.anonymousSession.deleteMany({
      where: { id: sessionId },
    });
  }
}
