import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthSession, Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ActiveAccessSession,
  AuthSessionWithUser,
  CreateSessionRecordParams,
  CreateSessionRecordResult,
  CreateSessionWithTransferParams,
  CreateSessionWithTransferResult,
  CreateUserWithSessionParams,
  CreateUserWithSessionResult,
  FindActiveAccessSessionParams,
  RevokeOwnedSessionParams,
  RotateSessionParams,
  TransferAnonymousChatsParams,
} from './auth.types';

export class SessionAlreadyRotatedError extends Error {}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithSession({
    input,
    anonymousSessionId,
    metadata,
    expiresAt,
    createCredentials,
  }: CreateUserWithSessionParams): Promise<CreateUserWithSessionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          password_hash: input.passwordHash,
          display_name: input.displayName,
        },
      });
      const chatIds = anonymousSessionId
        ? await this.transferAnonymousChats({
            transaction,
            anonymousSessionId,
            userId: user.id,
          })
        : [];
      const session = await this.createSessionRecord({
        transaction,
        userId: user.id,
        metadata,
        expiresAt,
        createCredentials,
      });
      return { user, chatIds, tokens: session.tokens };
    });
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async createSessionWithTransfer({
    userId,
    anonymousSessionId,
    metadata,
    expiresAt,
    createCredentials,
  }: CreateSessionWithTransferParams): Promise<CreateSessionWithTransferResult> {
    return this.prisma.$transaction(async (transaction) => {
      const chatIds = anonymousSessionId
        ? await this.transferAnonymousChats({
            transaction,
            anonymousSessionId,
            userId,
          })
        : [];
      const session = await this.createSessionRecord({
        transaction,
        userId,
        metadata,
        expiresAt,
        createCredentials,
      });
      return { chatIds, tokens: session.tokens };
    });
  }

  findSessionWithUser(sessionId: string): Promise<AuthSessionWithUser | null> {
    return this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
  }

  findActiveAccessSession({
    sessionId,
    userId,
  }: FindActiveAccessSessionParams): Promise<ActiveAccessSession | null> {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true, user_id: true },
    });
  }

  findActiveSessions(userId: string): Promise<AuthSession[]> {
    return this.prisma.authSession.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { last_used_at: 'desc' },
    });
  }

  async rotateSession({
    session,
    metadata,
    expiresAt,
    createCredentials,
  }: RotateSessionParams): Promise<CreateSessionRecordResult['tokens']> {
    return this.prisma.$transaction(async (transaction) => {
      const replacement = await this.createSessionRecord({
        transaction,
        userId: session.user_id,
        metadata,
        expiresAt,
        createCredentials,
      });
      const now = new Date();
      const rotated = await transaction.authSession.updateMany({
        where: { id: session.id, revoked_at: null },
        data: {
          revoked_at: now,
          replaced_by_session_id: replacement.id,
          last_used_at: now,
        },
      });

      if (rotated.count !== 1) {
        throw new SessionAlreadyRotatedError();
      }
      return replacement.tokens;
    });
  }

  revokeSession(sessionId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.authSession.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  revokeAllSessions(userId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.authSession.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  revokeOwnedSession({
    userId,
    sessionId,
  }: RevokeOwnedSessionParams): Promise<Prisma.BatchPayload> {
    return this.prisma.authSession.updateMany({
      where: { id: sessionId, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  async revokeRotationFamily(session: AuthSession): Promise<void> {
    const ids = [session.id];
    let nextId = session.replaced_by_session_id;

    while (nextId && ids.length < 100) {
      ids.push(nextId);
      const next = await this.prisma.authSession.findUnique({
        where: { id: nextId },
        select: { replaced_by_session_id: true },
      });
      nextId = next?.replaced_by_session_id ?? null;
    }

    await this.prisma.authSession.updateMany({
      where: { id: { in: ids } },
      data: { revoked_at: new Date() },
    });
  }

  private async createSessionRecord({
    transaction,
    userId,
    metadata,
    expiresAt,
    createCredentials,
  }: CreateSessionRecordParams): Promise<CreateSessionRecordResult> {
    // The refresh JWT needs IDs generated by PostgreSQL. Keep the row private
    // to this transaction until the real refresh-token hash is available.
    const session = await transaction.authSession.create({
      data: {
        user_id: userId,
        refresh_token_hash: randomBytes(32).toString('hex'),
        user_agent: metadata.userAgent,
        ip_hash: metadata.ipHash,
        expires_at: expiresAt,
      },
      select: { id: true, user_id: true, refresh_jti: true },
    });
    const credentials = await createCredentials({
      id: session.id,
      userId: session.user_id,
      refreshJti: session.refresh_jti,
    });
    await transaction.authSession.update({
      where: { id: session.id },
      data: { refresh_token_hash: credentials.refreshTokenHash },
    });
    return { id: session.id, tokens: credentials.tokens };
  }

  private async transferAnonymousChats({
    transaction,
    anonymousSessionId,
    userId,
  }: TransferAnonymousChatsParams): Promise<string[]> {
    const chats = await transaction.chat.findMany({
      where: { anonymous_session_id: anonymousSessionId },
      select: { id: true },
    });
    await transaction.chat.updateMany({
      where: { anonymous_session_id: anonymousSessionId },
      data: { anonymous_session_id: null, user_id: userId },
    });
    await transaction.anonymousSession.deleteMany({
      where: { id: anonymousSessionId },
    });
    return chats.map((chat) => chat.id);
  }
}
