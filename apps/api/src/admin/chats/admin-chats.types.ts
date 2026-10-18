import type { Prisma } from '../../generated/prisma/client';

export const ADMIN_CHAT_INCLUDE = {
  selected_model: { select: { name: true } },
  user: { select: { id: true, email: true } },
  messages: {
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ChatInclude;

export type AdminChatRecord = Prisma.ChatGetPayload<{
  include: typeof ADMIN_CHAT_INCLUDE;
}>;
