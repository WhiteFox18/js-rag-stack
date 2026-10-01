import { Injectable } from '@nestjs/common';
import { UsageRepository } from './usage.repository';
import type { ReassignAnonymousUsageParams } from './usage.types';

@Injectable()
export class UsageTransferService {
  constructor(private readonly usage: UsageRepository) {}

  reassignAnonymousUsage(params: ReassignAnonymousUsageParams): Promise<void> {
    return this.usage.reassignAnonymous(params);
  }
}
