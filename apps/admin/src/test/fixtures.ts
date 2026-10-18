import type {
  AdminAnonymousListItem,
  AdminChatDetail,
  AdminChatSummaryState,
  AdminModel,
  AdminUserListItem,
  UsageTotals,
} from '@js-rag-stack/contracts';

export function makeTotals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    requests: 3,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    lastActivityAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeUser(
  overrides: Partial<AdminUserListItem> = {},
): AdminUserListItem {
  return {
    id: '0199a000-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada',
    createdAt: '2026-09-01T10:00:00.000Z',
    usage: makeTotals(),
    ...overrides,
  };
}

export function makeAnonymous(
  overrides: Partial<AdminAnonymousListItem> = {},
): AdminAnonymousListItem {
  return {
    id: '0199a000-0000-7000-8000-0000000000aa',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastSeenAt: '2026-09-30T10:00:00.000Z',
    expiresAt: '2026-10-31T10:00:00.000Z',
    chatCount: 2,
    usage: makeTotals(),
    ...overrides,
  };
}

export function makeModel(overrides: Partial<AdminModel> = {}): AdminModel {
  return {
    id: '0199a000-0000-7000-8000-0000000000m1',
    name: 'qwen2.5:1.5b',
    maxContext: 8192,
    isAvailable: true,
    isDefault: true,
    installed: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeChatDetail(
  overrides: Partial<AdminChatDetail['chat']> & {
    messages?: AdminChatDetail['messages'];
  } = {},
): AdminChatDetail {
  const { messages, ...chat } = overrides;
  return {
    chat: {
      id: '0199a000-0000-7000-8000-0000000000c1',
      title: 'Planning a trip',
      model: 'qwen2.5:1.5b',
      createdAt: '2026-09-30T10:00:00.000Z',
      lastMessageAt: '2026-09-30T10:05:00.000Z',
      archivedAt: null,
      owner: {
        type: 'user',
        id: '0199a000-0000-7000-8000-000000000001',
        email: 'ada@example.com',
      },
      ...chat,
    },
    messages: messages ?? [
      {
        id: 'm1',
        role: 'user',
        status: 'completed',
        content: 'Hello there',
        model: null,
        createdAt: '2026-09-30T10:00:00.000Z',
        promptTokens: null,
        completionTokens: null,
      },
      {
        id: 'm2',
        role: 'assistant',
        status: 'completed',
        content: 'Hi, how can I help?',
        model: 'qwen2.5:1.5b',
        createdAt: '2026-09-30T10:00:05.000Z',
        promptTokens: 10,
        completionTokens: 20,
      },
    ],
  };
}

export function makeSummaryState(
  overrides: Partial<AdminChatSummaryState> = {},
): AdminChatSummaryState {
  return {
    content: null,
    summarizedThroughMessageId: null,
    model: null,
    generatedAt: null,
    stale: false,
    pendingMessages: 0,
    generating: false,
    ...overrides,
  };
}
