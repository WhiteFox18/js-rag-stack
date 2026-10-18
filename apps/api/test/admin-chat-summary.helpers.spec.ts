import {
  ADMIN_SUMMARY_INSTRUCTIONS,
  adminSummaryLockKey,
  toSummaryState,
} from '../src/admin/chats/admin-chat-summary.helpers';
import type { AdminChatSummaryWithModel } from '../src/admin/chats/admin-chats.types';
import type { ChatHistoryEntry } from '../src/chats/chats.types';

const entries: ChatHistoryEntry[] = [
  { id: 'u1', role: 'user', content: 'q1' },
  { id: 'a1', role: 'assistant', content: 'r1', model: 'm' },
  { id: 'u2', role: 'user', content: 'q2' },
  { id: 'a2', role: 'assistant', content: 'r2', model: 'm' },
];
const updated = new Date('2026-10-18T10:00:00.000Z');

function summary(through: string): AdminChatSummaryWithModel {
  return {
    id: 's',
    chat_id: 'c',
    content: 'notes',
    summarized_through_message_id: through,
    model_id: 'mid',
    token_count: 5,
    created_at: updated,
    updated_at: updated,
    model: { name: 'qwen' },
  };
}

describe('toSummaryState', () => {
  it('is empty and fresh with no summary and no entries', () => {
    const { state } = toSummaryState({
      summary: null,
      entries: [],
      generating: false,
    });
    expect(state).toMatchObject({
      content: null,
      stale: false,
      pendingMessages: 0,
      model: null,
      generatedAt: null,
    });
  });

  it('is stale with every entry pending when no summary exists', () => {
    const { state } = toSummaryState({
      summary: null,
      entries: entries,
      generating: false,
    });
    expect(state.stale).toBe(true);
    expect(state.pendingMessages).toBe(4);
  });

  it('returns only entries after the summarized message', () => {
    const { state, pending } = toSummaryState({
      summary: summary('a1'),
      entries,
      generating: false,
    });
    expect(state.stale).toBe(true);
    expect(state.pendingMessages).toBe(2);
    expect(pending.map((e) => e.id)).toEqual(['u2', 'a2']);
    expect(state.content).toBe('notes');
    expect(state.model).toBe('qwen');
    expect(state.generatedAt).toBe(updated.toISOString());
    expect(state.summarizedThroughMessageId).toBe('a1');
  });

  it('is fresh when summarized through the last entry', () => {
    const { state } = toSummaryState({
      summary: summary('a2'),
      entries,
      generating: false,
    });
    expect(state.stale).toBe(false);
  });

  it('treats everything as pending when the through id is missing', () => {
    const { state, pending } = toSummaryState({
      summary: summary('gone'),
      entries,
      generating: false,
    });
    expect(pending).toEqual(entries);
    expect(state.content).toBe('notes');
    expect(state.stale).toBe(true);
  });

  it('passes generating through', () => {
    const { state } = toSummaryState({
      summary: null,
      entries: [],
      generating: true,
    });
    expect(state.generating).toBe(true);
  });
});

describe('summary constants', () => {
  it('builds the lock key', () => {
    expect(adminSummaryLockKey('x')).toBe('admin-chat-summary-lock:x');
  });
  it('has the spec instructions', () => {
    expect(ADMIN_SUMMARY_INSTRUCTIONS).toMatch(/^You write a short overview/);
    expect(ADMIN_SUMMARY_INSTRUCTIONS).toMatch(
      /Reply with the overview only\.$/,
    );
  });
});
