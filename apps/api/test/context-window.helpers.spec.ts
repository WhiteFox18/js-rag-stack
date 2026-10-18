import {
  buildSummaryRequest,
  chunkEntries,
  dropOldestTurns,
  entriesAfter,
  estimateMessageTokens,
  estimatePromptTokens,
  getContextBudget,
  isDegenerateSummary,
  needsSummarization,
  selectTurnsToFold,
  toPromptMessages,
} from '../src/chats/context-window.helpers';
import type { ChatHistoryEntry } from '../src/chats/chats.types';
import { toHistoryEntries } from '../src/chats/chats.helpers';
import type { Message } from '../src/generated/prisma/client';

const settings = {
  summarizeAtRatio: 0.75,
  targetRatio: 0.4,
  keepRecentMessages: 4,
  charsPerToken: 3,
  summaryMaxRatio: 0.1,
};

function turn(index: number, size = 30): ChatHistoryEntry[] {
  return [
    { id: `u${index}`, role: 'user', content: 'u'.repeat(size) },
    {
      id: `a${index}`,
      role: 'assistant',
      content: 'a'.repeat(size),
      model: 'm',
    },
  ];
}

describe('context window helpers', () => {
  it('derives the budget from max_context', () => {
    expect(getContextBudget(8192, settings)).toEqual({
      trigger: 6144,
      target: 3276,
      summaryMaxTokens: 819,
      chunkTokens: 8192 - 2 * 819 - 256,
    });
  });

  it('estimates tokens conservatively with per-message overhead', () => {
    expect(estimateMessageTokens('abcdef', 3)).toBe(2 + 4);
    expect(
      estimatePromptTokens({
        summary: 'x'.repeat(30),
        turns: turn(1),
        content: 'hi',
        charsPerToken: 3,
      }),
    ).toBe(
      estimateMessageTokens(
        'Summary of the earlier conversation:\n' + 'x'.repeat(30),
        3,
      ) +
        2 * (10 + 4) +
        (1 + 4),
    );
  });

  it('corrects a low estimate with the last reported token usage', () => {
    expect(
      needsSummarization({
        estimate: 100,
        lastReportedTokens: null,
        contentTokens: 10,
        trigger: 200,
      }),
    ).toBe(false);
    expect(
      needsSummarization({
        estimate: 100,
        lastReportedTokens: 195,
        contentTokens: 10,
        trigger: 200,
      }),
    ).toBe(true);
  });

  it('returns entries after the summarized message, or all when unknown', () => {
    const history = [...turn(1), ...turn(2)];
    expect(entriesAfter(history, 'a1').map((entry) => entry.id)).toEqual([
      'u2',
      'a2',
    ]);
    expect(entriesAfter(history, null)).toHaveLength(4);
    expect(entriesAfter(history, 'missing')).toHaveLength(4);
  });

  it('folds whole turns from the start until the rest fits the target', () => {
    const turns = [
      ...turn(1, 300),
      ...turn(2, 300),
      ...turn(3, 300),
      ...turn(4, 300),
    ];
    // each message ≈ 104 tokens; 8 messages ≈ 832 + content
    const fold = selectTurnsToFold({
      turns,
      content: 'next',
      keepRecent: 4,
      target: 500,
      summaryTokens: 50,
      charsPerToken: 3,
    });
    expect(fold).toBe(4);
    expect(turns[fold]?.role).toBe('user');
  });

  it('never folds the most recent messages', () => {
    const turns = [...turn(1, 3000), ...turn(2, 3000)];
    expect(
      selectTurnsToFold({
        turns,
        content: 'next',
        keepRecent: 4,
        target: 10,
        summaryTokens: 0,
        charsPerToken: 3,
      }),
    ).toBe(0);
  });

  it('dropOldestTurns drops whole turns until the prompt fits', () => {
    const turns = [...turn(1, 300), ...turn(2, 300), ...turn(3, 300)];
    const kept = dropOldestTurns({
      summary: null,
      turns,
      content: 'next',
      charsPerToken: 3,
      limit: 250,
    });
    expect(kept.map((entry) => entry.id)).toEqual(['u3', 'a3']);
    expect(
      dropOldestTurns({
        summary: null,
        turns,
        content: 'next',
        charsPerToken: 3,
        limit: 5,
      }),
    ).toEqual([]);
  });

  it('splits folded entries into chunks under the budget', () => {
    const entries = [...turn(1, 300), ...turn(2, 300)];
    const chunks = chunkEntries({ entries, budget: 220, charsPerToken: 3 });
    expect(chunks.map((chunk) => chunk.map((entry) => entry.id))).toEqual([
      ['u1', 'a1'],
      ['u2', 'a2'],
    ]);
  });

  it('buildSummaryRequest carries the previous summary and truncates oversized entries', () => {
    const [system, user] = buildSummaryRequest({
      previousSummary: 'Known: likes Rust.',
      entries: [
        { id: 'a1', role: 'assistant', content: 'z'.repeat(50), model: 'm' },
      ],
      maxEntryChars: 10,
    });
    expect(system?.role).toBe('system');
    expect(system?.content).toContain(
      'Keep every bullet from the existing notes',
    );
    expect(user?.content).toContain('Existing notes:\nKnown: likes Rust.');
    expect(user?.content).toContain(`Assistant: ${'z'.repeat(10)}…`);
    expect(user?.content).not.toContain('z'.repeat(11));
  });

  it('buildSummaryRequest omits the existing-notes section without a previous summary', () => {
    const [, user] = buildSummaryRequest({
      previousSummary: null,
      entries: [{ id: 'u1', role: 'user', content: 'My cat is Miso.' }],
      maxEntryChars: 100,
    });
    expect(user?.content.startsWith('Messages to take notes on:')).toBe(true);
    expect(user?.content).not.toContain('(none)');
    expect(user?.content).not.toContain('Existing notes');
  });

  it('isDegenerateSummary flags empty and placeholder output only', () => {
    for (const text of ['', '(none)', 'None.', ' - ']) {
      expect(isDegenerateSummary(text)).toBe(true);
    }
    expect(isDegenerateSummary('- The user has a cat named Miso.')).toBe(false);
  });

  it('builds the prompt with the summary as a system message', () => {
    expect(
      toPromptMessages({ summary: 'S', turns: turn(1, 1), content: 'now' }),
    ).toEqual([
      { role: 'system', content: 'Summary of the earlier conversation:\nS' },
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
      { role: 'user', content: 'now' },
    ]);
  });
});

function message(
  id: string,
  role: 'USER' | 'ASSISTANT',
  status: Message['status'],
): Message {
  return {
    id,
    chat_id: 'c1',
    role,
    status,
    content: id,
    model: role === 'ASSISTANT' ? 'qwen2.5:1.5b' : null,
    token_count: null,
    token_count_source: 'UNKNOWN',
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    finish_reason: null,
    error_code: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };
}

describe('toHistoryEntries', () => {
  it('keeps only completed turns', () => {
    const messages = [
      message('u1', 'USER', 'COMPLETED'),
      message('a1', 'ASSISTANT', 'COMPLETED'),
      message('u2', 'USER', 'COMPLETED'),
      message('a2', 'ASSISTANT', 'FAILED'),
      message('u3', 'USER', 'COMPLETED'),
      message('a3', 'ASSISTANT', 'STREAMING'),
    ];
    expect(toHistoryEntries(messages).map((e) => e.id)).toEqual(['u1', 'a1']);
  });
});

describe('buildSummaryRequest instructions', () => {
  const entries: ChatHistoryEntry[] = [
    { id: 'u1', role: 'user', content: 'hi' },
  ];

  it('uses custom instructions when given', () => {
    const [system] = buildSummaryRequest({
      previousSummary: null,
      entries,
      maxEntryChars: 100,
      instructions: 'ADMIN',
    });
    expect(system).toEqual({ role: 'system', content: 'ADMIN' });
  });

  it('keeps default instructions', () => {
    expect(
      buildSummaryRequest({
        previousSummary: null,
        entries,
        maxEntryChars: 100,
      })[0]?.content,
    ).toContain('You keep notes');
  });
});
