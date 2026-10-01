import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateUsageRecord,
  ReassignAnonymousUsageParams,
} from './usage.types';

@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUsageRecord): Promise<void> {
    await this.prisma.usageLog.create({ data, select: { id: true } });
  }

  async reassignAnonymous({
    transaction,
    anonymousSessionId,
    userId,
  }: ReassignAnonymousUsageParams): Promise<void> {
    await transaction.usageLog.updateMany({
      where: { anonymous_session_id: anonymousSessionId },
      data: { anonymous_session_id: null, user_id: userId },
    });
  }
}
