import { Injectable, Logger } from '@nestjs/common';
import { getErrorMessage } from '../common/utils/error';
import { toOwnerColumns, toTokenCount, toUsageOwner } from './usage.helpers';
import { UsageRepository } from './usage.repository';
import type { RecordUsageParams } from './usage.types';

@Injectable()
export class UsageRecorderService {
  private readonly logger = new Logger(UsageRecorderService.name);

  constructor(private readonly usage: UsageRepository) {}

  // Usage logging must never break a user's generation.
  async record(params: RecordUsageParams): Promise<void> {
    try {
      await this.usage.create({
        ...toOwnerColumns(toUsageOwner(params.principal)),
        chat_id: params.chatId,
        model_id: params.modelId,
        kind: params.kind,
        input_tokens: toTokenCount(params.inputTokens),
        output_tokens: toTokenCount(params.outputTokens),
      });
    } catch (error) {
      this.logger.warn(`Usage record failed: ${getErrorMessage(error)}`);
    }
  }
}
