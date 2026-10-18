import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminChatDetail } from '@js-rag-stack/contracts';
import { toAdminChatDetail } from './admin-chats.helpers';
import { AdminChatsRepository } from './admin-chats.repository';

@Injectable()
export class AdminChatsService {
  constructor(private readonly chats: AdminChatsRepository) {}

  async getChat(id: string): Promise<AdminChatDetail> {
    const record = await this.chats.findChat(id);
    if (!record) throw new NotFoundException('Chat not found.');
    return toAdminChatDetail(record);
  }
}
