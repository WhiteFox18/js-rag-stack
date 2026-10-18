import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { AdminAuthGuard } from '../src/admin/auth/admin-auth.guard';
import { AdminChatsController } from '../src/admin/chats/admin-chats.controller';
import { AdminChatsRepository } from '../src/admin/chats/admin-chats.repository';
import { AdminChatsService } from '../src/admin/chats/admin-chats.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureDefaultModel } from './models.test-helpers';

describe('admin chats', () => {
  let prisma: PrismaService;
  let service: AdminChatsService;
  let repo: AdminChatsRepository;
  let modelId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    await ensureDefaultModel(prisma);
    modelId = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
    repo = new AdminChatsRepository(prisma);
    service = new AdminChatsService(repo);
  });

  afterAll(async () => {
    // chat and message rows cascade from user
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.onApplicationShutdown();
  });

  it('returns chat detail with ordered messages and owner email', async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com`, password_hash: 'x' },
    });
    userIds.push(user.id);
    const chat = await prisma.chat.create({
      data: { user_id: user.id, title: 'Hello', selected_model_id: modelId },
    });
    const sameTime = new Date('2026-01-01T00:00:00.000Z');
    const [idFirst, idSecond] = [randomUUID(), randomUUID()].sort() as [
      string,
      string,
    ];
    // inserted in reverse id order with equal created_at: id breaks the tie
    await prisma.message.create({
      data: {
        id: idSecond,
        created_at: sameTime,
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'second',
        prompt_tokens: 3,
        completion_tokens: 4,
      },
    });
    await prisma.message.create({
      data: {
        id: idFirst,
        created_at: sameTime,
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'first',
      },
    });

    const detail = await service.getChat(chat.id);
    expect(detail.chat.owner).toEqual({
      type: 'user',
      id: user.id,
      email: user.email,
    });
    expect(detail.chat.model).toBe('qwen2.5:1.5b');
    expect(detail.messages.map((m) => m.content)).toEqual(['first', 'second']);
    expect(detail.messages[1]).toMatchObject({
      role: 'assistant',
      promptTokens: 3,
      completionTokens: 4,
    });
    expect((await repo.findMessages(chat.id)).length).toBe(2);
    expect(await repo.chatExists(chat.id)).toBe(true);
    expect(await repo.chatExists(randomUUID())).toBe(false);
  });

  it('rejects unknown chat', async () => {
    await expect(service.getChat(randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('upserts a summary and cascades its deletion with the chat', async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com`, password_hash: 'x' },
    });
    userIds.push(user.id);
    const chat = await prisma.chat.create({
      data: { user_id: user.id, title: 'S', selected_model_id: modelId },
    });
    const first = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'q',
      },
    });
    const second = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'r',
      },
    });
    expect(await repo.findSummary(chat.id)).toBeNull();
    await repo.upsertSummary({
      chatId: chat.id,
      content: 'v1',
      summarizedThroughMessageId: first.id,
      modelId,
      tokenCount: 3,
    });
    const updated = await repo.upsertSummary({
      chatId: chat.id,
      content: 'v2',
      summarizedThroughMessageId: second.id,
      modelId,
      tokenCount: 4,
    });
    expect(updated).toMatchObject({
      content: 'v2',
      summarized_through_message_id: second.id,
      model: { name: 'qwen2.5:1.5b' },
    });
    expect(
      await prisma.adminChatSummary.count({ where: { chat_id: chat.id } }),
    ).toBe(1);

    await prisma.chat.delete({ where: { id: chat.id } });
    expect(
      await prisma.adminChatSummary.count({ where: { chat_id: chat.id } }),
    ).toBe(0);
  });

  it('guards the controller with AdminAuthGuard', () => {
    expect(Reflect.getMetadata('__guards__', AdminChatsController)).toContain(
      AdminAuthGuard,
    );
  });
});
