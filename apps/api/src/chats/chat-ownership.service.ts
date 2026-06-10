import { Injectable, NotFoundException } from '@nestjs/common';
import type { RequestPrincipal } from '../common/models/request-principal';
import type { Chat } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async find_owned_chat(
    chat_id: string,
    principal: RequestPrincipal,
  ): Promise<Chat> {
    const owner_filter =
      principal.type === 'authenticated'
        ? { user_id: principal.user_id }
        : { anonymous_session_id: principal.anonymous_session_id };
    const chat = await this.prisma.chat.findFirst({
      where: { id: chat_id, ...owner_filter },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found.');
    }

    return chat;
  }
}
