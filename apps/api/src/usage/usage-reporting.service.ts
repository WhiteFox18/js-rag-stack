import { Injectable } from '@nestjs/common';
import type {
  Paginated,
  UsageBreakdownItem,
  UsageRow,
  UsageTotals,
} from '@js-rag-stack/contracts';
import { toSafeNumber, toUsageWhere, toWireKind } from './usage.helpers';
import { UsageRepository } from './usage.repository';
import type { UsageQueryParams, UsageRowsParams } from './usage.types';

@Injectable()
export class UsageReportingService {
  constructor(private readonly usage: UsageRepository) {}

  async getTotals(params: UsageQueryParams): Promise<UsageTotals> {
    const result = await this.usage.aggregate(toUsageWhere(params));
    const inputTokens = toSafeNumber(result._sum.input_tokens);
    const outputTokens = toSafeNumber(result._sum.output_tokens);
    return {
      requests: result._count._all,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      lastActivityAt: result._max.created_at?.toISOString() ?? null,
    };
  }

  async getBreakdown(params: UsageQueryParams): Promise<UsageBreakdownItem[]> {
    const { groups, modelNames } = await this.usage.breakdown(
      toUsageWhere(params),
    );
    return groups.map((group) => ({
      model: modelNames.get(group.model_id) ?? 'unknown',
      kind: toWireKind(group.kind),
      requests: group._count._all,
      inputTokens: toSafeNumber(group._sum.input_tokens),
      outputTokens: toSafeNumber(group._sum.output_tokens),
    }));
  }

  async listRows({
    page,
    ...params
  }: UsageRowsParams): Promise<Paginated<UsageRow>> {
    const [rows, total] = await this.usage.findRows({
      where: toUsageWhere(params),
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        model: row.model.name,
        kind: toWireKind(row.kind),
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        chatId: row.chat_id,
      })),
      page: page.page,
      pageSize: page.pageSize,
      total,
    };
  }
}
