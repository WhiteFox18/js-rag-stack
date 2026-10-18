import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMIN_SUMMARY_INSTRUCTIONS } from '../src/admin/chats/admin-chat-summary.helpers';
import type { UpsertAdminChatSummaryParams } from '../src/admin/chats/admin-chats.types';
import { AdminChatSummaryService } from '../src/admin/chats/admin-chat-summary.service';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';

const config = new ConfigService<AppEnvironment, true>(
  validateEnvironment({ NODE_ENV: 'test' }),
);
const now = new Date('2026-10-18T12:00:00.000Z');

function msg(
  id: string,
  role: 'USER' | 'ASSISTANT',
  content: string,
  i: number,
) {
  return {
    id,
    chat_id: 'chat',
    role,
    status: 'COMPLETED',
    content,
    model: role === 'ASSISTANT' ? 'm' : null,
    created_at: new Date(now.getTime() + i),
    prompt_tokens: null,
    completion_tokens: null,
  };
}

function turns(count: number, size = 20) {
  return Array.from({ length: count }, (_, i) => [
    msg(`u${i + 1}`, 'USER', `Q${i + 1}`.padEnd(size, 'q'), i * 2),
    msg(`a${i + 1}`, 'ASSISTANT', `R${i + 1}`.padEnd(size, 'r'), i * 2 + 1),
  ]).flat();
}

function storedSummary(through: string, content = 'old notes') {
  return {
    id: 's',
    chat_id: 'chat',
    content,
    summarized_through_message_id: through,
    model_id: 'model-id',
    token_count: 5,
    created_at: now,
    updated_at: now,
    model: { name: 'qwen2.5:1.5b' },
  };
}

interface CompleteArgs {
  messages: { content: string }[];
  maxTokens: number;
  signal: AbortSignal;
}

function setup({
  messages = turns(2),
  summary = null as ReturnType<typeof storedSummary> | null,
  maxContext = 8192,
  exists = true,
  lockHeld = false,
  results = [
    { content: 'new notes', promptTokens: 10, completionTokens: 7 },
  ] as {
    content: string;
    promptTokens: number | null;
    completionTokens: number | null;
  }[],
} = {}) {
  const lock = {
    release: jest.fn().mockResolvedValue(true),
    extend: jest.fn().mockResolvedValue(true),
  };
  const locks = {
    acquire: jest.fn().mockResolvedValue(lockHeld ? undefined : lock),
  };
  const repository = {
    chatExists: jest.fn().mockResolvedValue(exists),
    findMessages: jest.fn().mockResolvedValue(messages),
    findSummary: jest.fn().mockResolvedValue(summary),
    upsertSummary: jest
      .fn()
      .mockImplementation((p: UpsertAdminChatSummaryParams) =>
        Promise.resolve({
          ...storedSummary(p.summarizedThroughMessageId, p.content),
          token_count: p.tokenCount,
        }),
      ),
  };
  const catalog = {
    getDefault: jest.fn().mockResolvedValue({
      id: 'model-id',
      name: 'qwen2.5:1.5b',
      max_context: maxContext,
    }),
  };
  const complete = jest.fn<Promise<unknown>, [CompleteArgs]>();
  results.forEach((r) => complete.mockResolvedValueOnce(r));
  complete.mockResolvedValue(results.at(-1));
  const ollama = { complete };
  const usage = { record: jest.fn().mockResolvedValue(undefined) };
  const redis = { get: jest.fn().mockResolvedValue(null) };
  const service = new AdminChatSummaryService(
    repository as never,
    catalog as never,
    ollama as never,
    usage as never,
    locks as never,
    redis as never,
    config,
  );
  return { service, repository, catalog, ollama, usage, locks, lock, redis };
}

describe('AdminChatSummaryService', () => {
  it('returns cached state without calling ollama when fresh', async () => {
    const { service, ollama, locks } = setup({ summary: storedSummary('a2') });
    const state = await service.refreshSummary('chat');
    expect(state.stale).toBe(false);
    expect(state.content).toBe('old notes');
    expect(ollama.complete).not.toHaveBeenCalled();
    expect(locks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'admin-chat-summary-lock:chat' }),
    );
  });

  it('summarizes all entries when no summary exists', async () => {
    const { service, repository, ollama } = setup();
    const state = await service.refreshSummary('chat');
    expect(ollama.complete).toHaveBeenCalledTimes(1);
    expect(repository.upsertSummary).toHaveBeenCalledWith({
      chatId: 'chat',
      content: 'new notes',
      summarizedThroughMessageId: 'a2',
      modelId: 'model-id',
      tokenCount: 7,
    });
    expect(state.content).toBe('new notes');
  });

  it('sends previous summary and only new entries when stale', async () => {
    const { service, ollama } = setup({ summary: storedSummary('a1') });
    await service.refreshSummary('chat');
    const args = ollama.complete.mock.calls[0]![0];
    expect(args.messages[0]!.content).toBe(ADMIN_SUMMARY_INSTRUCTIONS);
    expect(args.messages[1]!.content).toContain('Existing notes:\nold notes');
    expect(args.messages[1]!.content).toContain('Q2');
    expect(args.messages[1]!.content).toContain('R2');
    expect(args.messages[1]!.content).not.toContain('Q1');
    expect(args.maxTokens).toBeLessThanOrEqual(400);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('chunks a large backlog and feeds each result forward', async () => {
    const { service, ollama } = setup({
      messages: turns(4, 600),
      maxContext: 1000,
      results: [
        { content: 'first result', promptTokens: 1, completionTokens: 1 },
        { content: 'second result', promptTokens: 1, completionTokens: 1 },
        { content: 'third result', promptTokens: 1, completionTokens: 1 },
        { content: 'fourth result', promptTokens: 1, completionTokens: 1 },
        { content: 'fifth result', promptTokens: 1, completionTokens: 1 },
        { content: 'sixth result', promptTokens: 1, completionTokens: 1 },
        { content: 'seventh result', promptTokens: 1, completionTokens: 1 },
        { content: 'eighth result', promptTokens: 1, completionTokens: 1 },
      ],
    });
    await service.refreshSummary('chat');
    expect(ollama.complete.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(ollama.complete.mock.calls[1]![0].messages[1]!.content).toContain(
      'Existing notes:\nfirst result',
    );
  });

  it('records ADMIN_SUMMARY usage per call with null principal', async () => {
    const { service, usage } = setup();
    await service.refreshSummary('chat');
    expect(usage.record).toHaveBeenCalledWith({
      principal: null,
      chatId: 'chat',
      modelId: 'model-id',
      kind: 'ADMIN_SUMMARY',
      inputTokens: 10,
      outputTokens: 7,
    });
  });

  it('throws SUMMARY_FAILED and saves nothing on degenerate output', async () => {
    const { service, repository, usage, lock } = setup({
      results: [{ content: '  ', promptTokens: 3, completionTokens: 1 }],
    });
    await expect(service.refreshSummary('chat')).rejects.toMatchObject({
      code: 'SUMMARY_FAILED',
      status: 502,
    });
    expect(usage.record).toHaveBeenCalledTimes(1);
    expect(repository.upsertSummary).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('keeps previous summary when complete() throws', async () => {
    const { service, repository, ollama, lock } = setup({
      summary: storedSummary('a1'),
    });
    ollama.complete.mockReset().mockRejectedValue(new Error('boom'));
    await expect(service.refreshSummary('chat')).rejects.toThrow('boom');
    expect(repository.upsertSummary).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('throws SUMMARY_IN_PROGRESS when the lock is held', async () => {
    const { service, ollama } = setup({ lockHeld: true });
    await expect(service.refreshSummary('chat')).rejects.toMatchObject({
      code: 'SUMMARY_IN_PROGRESS',
      status: 409,
    });
    expect(ollama.complete).not.toHaveBeenCalled();
  });

  it('saves through last included entry when chat grew during refresh', async () => {
    const snapshot = turns(2);
    const grown = [...snapshot, ...turns(3).slice(4)];
    const { service, repository } = setup();
    repository.findMessages
      .mockReset()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(grown);
    const state = await service.refreshSummary('chat');
    expect(repository.upsertSummary).toHaveBeenCalledWith(
      expect.objectContaining({ summarizedThroughMessageId: 'a2' }),
    );
    expect(state.stale).toBe(true);
    expect(state.pendingMessages).toBe(2);
  });

  it('releases the lock after success', async () => {
    const { service, lock } = setup();
    await service.refreshSummary('chat');
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('getSummary reports generating when the lock key exists', async () => {
    const { service, redis } = setup({ summary: storedSummary('a1') });
    redis.get.mockResolvedValue('token');
    const state = await service.getSummary('chat');
    expect(redis.get).toHaveBeenCalledWith('admin-chat-summary-lock:chat');
    expect(state.generating).toBe(true);
    expect(state.pendingMessages).toBe(2);
  });

  it('summarizes from scratch when the through-message is missing', async () => {
    const { service, ollama } = setup({ summary: storedSummary('gone') });
    await service.refreshSummary('chat');
    const content = ollama.complete.mock.calls[0]![0].messages[1]!.content;
    expect(content).not.toContain('Existing notes:');
    for (const text of ['Q1', 'R1', 'Q2', 'R2']) {
      expect(content).toContain(text);
    }
  });

  it('maps a mid-refresh chat deletion to NotFoundException', async () => {
    const { service, repository } = setup();
    repository.upsertSummary.mockRejectedValue(new Error('FK violated'));
    repository.chatExists
      .mockReset()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(service.refreshSummary('chat')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('heartbeats the lock while complete() is pending, then stops', async () => {
    jest.useFakeTimers();
    try {
      const ttl = config.get('REDIS_LOCK_TTL_MS', { infer: true });
      const { service, ollama, lock } = setup();
      let resolveComplete: (value: unknown) => void = () => undefined;
      ollama.complete.mockReset().mockReturnValue(
        new Promise((resolve) => {
          resolveComplete = resolve;
        }),
      );
      const pending = service.refreshSummary('chat');
      await jest.advanceTimersByTimeAsync(Math.floor(ttl / 3));
      expect(lock.extend).toHaveBeenCalledWith(ttl);
      const callsBefore = lock.extend.mock.calls.length;
      expect(callsBefore).toBeGreaterThanOrEqual(1);

      resolveComplete({
        content: 'done',
        promptTokens: 1,
        completionTokens: 1,
      });
      await pending;
      await jest.advanceTimersByTimeAsync(ttl * 3);
      expect(lock.extend.mock.calls.length).toBe(callsBefore);
      expect(lock.release).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws NotFoundException for a missing chat', async () => {
    const { service } = setup({ exists: false });
    await expect(service.getSummary('chat')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.refreshSummary('chat')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
