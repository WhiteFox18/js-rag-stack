import type { AdminChatSummaryState } from '@js-rag-stack/contracts';
import type { ChatHistoryEntry } from '../../chats/chats.types';
import { entriesAfter } from '../../chats/context-window.helpers';
import type { AdminChatSummaryWithModel } from './admin-chats.types';

export const ADMIN_SUMMARY_INSTRUCTIONS =
  "You write a short overview of a conversation between a user and an assistant for an administrator. In at most 120 words of plain prose cover: the topic, what the user wanted, what the assistant provided, the outcome, and anything left unresolved. When existing overview text is given, rewrite it into one updated overview that includes the new messages; do not append a separate section. Write in the conversation's language. Reply with the overview only.";

export function adminSummaryLockKey(chatId: string): string {
  return `admin-chat-summary-lock:${chatId}`;
}

export function toSummaryState({
  summary,
  entries,
  generating,
}: {
  summary: AdminChatSummaryWithModel | null;
  entries: ChatHistoryEntry[];
  generating: boolean;
}): { pending: ChatHistoryEntry[]; state: AdminChatSummaryState } {
  const pending = entriesAfter(
    entries,
    summary?.summarized_through_message_id ?? null,
  );
  return {
    pending,
    state: {
      content: summary?.content ?? null,
      summarizedThroughMessageId:
        summary?.summarized_through_message_id ?? null,
      model: summary?.model.name ?? null,
      generatedAt: summary?.updated_at.toISOString() ?? null,
      stale: pending.length > 0,
      pendingMessages: pending.length,
      generating,
    },
  };
}
