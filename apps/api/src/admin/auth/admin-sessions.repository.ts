import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AdminSession } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSessionRotatedError,
  type AdminTokens,
  type CreateAdminSessionParams,
  type CreateAdminSessionRecordParams,
  type FindActiveAdminSessionParams,
  type RotateAdminSessionParams,
} from './admin-auth.types';

@Injectable()
export class AdminSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateAdminSessionParams): Promise<AdminTokens> {
    return this.prisma.$transaction((transaction) =>
      this.createRecord({ ...params, transaction }),
    );
  }

  findById(id: string): Promise<AdminSession | null> {
    return this.prisma.adminSession.findUnique({ where: { id } });
  }

  findActive({ sessionId, adminId }: FindActiveAdminSessionParams) {
    return this.prisma.adminSession.findFirst({
      where: {
        id: sessionId,
        admin_id: adminId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true, admin_id: true },
    });
  }

  // Revoke-then-create in one transaction; a reused refresh token loses the race.
  rotate({
    sessionId,
    ...params
  }: RotateAdminSessionParams): Promise<AdminTokens> {
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.adminSession.updateMany({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: new Date(), last_used_at: new Date() },
      });
      if (revoked.count !== 1) throw new AdminSessionRotatedError();
      return this.createRecord({ ...params, transaction });
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async createRecord({
    transaction,
    adminId,
    expiresAt,
    createCredentials,
  }: CreateAdminSessionRecordParams): Promise<AdminTokens> {
    // The refresh JWT embeds DB-generated ids; the placeholder hash never leaves the transaction.
    const session = await transaction.adminSession.create({
      data: {
        admin_id: adminId,
        refresh_token_hash: randomBytes(32).toString('hex'),
        expires_at: expiresAt,
      },
      select: { id: true, admin_id: true, refresh_jti: true },
    });
    const credentials = await createCredentials({
      id: session.id,
      adminId: session.admin_id,
      refreshJti: session.refresh_jti,
    });
    await transaction.adminSession.update({
      where: { id: session.id },
      data: { refresh_token_hash: credentials.refreshTokenHash },
    });
    return credentials.tokens;
  }
}
