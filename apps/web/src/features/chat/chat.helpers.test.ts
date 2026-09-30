import { describe, expect, it } from 'vitest';
import { makeChat, makeMessage } from '../../test/fixtures';
import {
  applyStreamEvent,
  deriveChatTitle,
  describeTokens,
  groupChatsByRecency,
  mergeMessages,
} from './chat.helpers';
import type { PendingStream } from './chat.types';

const pending: PendingStream = {
  chatId: 'c1',
  status: 'streaming',
  userContent: 'hi',
  userMessageId: null,
  assistantMessageId: null,
  model: null,
  assistantText: '',
  errorMessage: null,
};

describe('groupChatsByRecency', () => {
  it('buckets chats by last message age', () => {
    const now = new Date('2026-09-30T12:00:00');
    const groups = groupChatsByRecency({
      now,
      chats: [
        makeChat({ id: 'a', lastMessageAt: '2026-09-30T08:00:00' }),
        makeChat({ id: 'b', lastMessageAt: '2026-09-29T08:00:00' }),
        makeChat({ id: 'c', lastMessageAt: '2026-09-26T08:00:00' }),
        makeChat({ id: 'd', lastMessageAt: '2026-08-01T08:00:00' }),
      ],
    });
    expect(groups.map((g) => [g.label, g.chats[0]?.id])).toEqual([
      ['Today', 'a'],
      ['Yesterday', 'b'],
      ['Previous 7 days', 'c'],
      ['Older', 'd'],
    ]);
  });
});

describe('applyStreamEvent', () => {
  it('accumulates deltas and tracks ids', () => {
    let state = applyStreamEvent({
      pending,
      event: {
        event: 'stream.started',
        data: {
          chatId: 'c1',
          userMessageId: 'u',
          assistantMessageId: 'a',
          model: 'm',
        },
      },
    });
    state = applyStreamEvent({
      pending: state,
      event: {
        event: 'message.delta',
        data: { assistantMessageId: 'a', delta: 'Hel' },
      },
    });
    state = applyStreamEvent({
      pending: state,
      event: {
        event: 'message.delta',
        data: { assistantMessageId: 'a', delta: 'lo' },
      },
    });
    expect(state).toMatchObject({
      userMessageId: 'u',
      assistantMessageId: 'a',
      assistantText: 'Hello',
      status: 'streaming',
    });
  });

  it('records stream errors', () => {
    const state = applyStreamEvent({
      pending,
      event: {
        event: 'stream.error',
        data: { code: 'X', message: 'Model failed' },
      },
    });
    expect(state).toMatchObject({
      status: 'error',
      errorMessage: 'Model failed',
    });
  });
});

describe('message helpers', () => {
  it('derives short single-line titles', () => {
    expect(deriveChatTitle('  a\n\n b  ')).toBe('a b');
    expect(deriveChatTitle('x'.repeat(100))).toHaveLength(58);
  });

  it('merges pages chronologically without duplicates', () => {
    const merged = mergeMessages([
      [makeMessage({ id: '3' }), makeMessage({ id: '4' })],
      [
        makeMessage({ id: '1' }),
        makeMessage({ id: '2' }),
        makeMessage({ id: '3' }),
      ],
    ]);
    expect(merged.map((m) => m.id)).toEqual(['1', '2', '3', '4']);
  });

  it('describes token metadata', () => {
    const lines = describeTokens(
      makeMessage({
        role: 'assistant',
        model: 'qwen2.5:1.5b',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        tokenCount: 5,
        tokenCountSource: 'ollama_reported',
        finishReason: 'stop',
      }),
    );
    expect(lines).toContain('Message tokens: 5 (ollama reported)');
    expect(lines).toContain('Model: qwen2.5:1.5b');
  });
});
