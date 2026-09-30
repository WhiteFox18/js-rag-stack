import type { ChatMessage } from '@js-rag-stack/contracts';
import type {
  ApplyStreamEventParams,
  ChatGroup,
  GroupChatsParams,
  PendingMessagesParams,
  PendingStream,
  PromptSummary,
} from './chat.types';

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function groupChatsByRecency({
  chats,
  now,
}: GroupChatsParams): ChatGroup[] {
  const today = startOfDay(now);
  const buckets: ChatGroup[] = [
    { label: 'Today', chats: [] },
    { label: 'Yesterday', chats: [] },
    { label: 'Previous 7 days', chats: [] },
    { label: 'Older', chats: [] },
  ];

  for (const chat of chats) {
    const age = today - startOfDay(new Date(chat.lastMessageAt));
    const index = age <= 0 ? 0 : age <= DAY_MS ? 1 : age <= 7 * DAY_MS ? 2 : 3;
    buckets[index]?.chats.push(chat);
  }

  return buckets.filter((bucket) => bucket.chats.length > 0);
}

function collapseWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function deriveChatTitle(content: string): string {
  const singleLine = collapseWhitespace(content);
  return singleLine.length > 60 ? `${singleLine.slice(0, 57)}…` : singleLine;
}

export function applyStreamEvent({
  pending,
  event,
}: ApplyStreamEventParams): PendingStream {
  switch (event.event) {
    case 'stream.started':
      return {
        ...pending,
        userMessageId: event.data.userMessageId,
        assistantMessageId: event.data.assistantMessageId,
        model: event.data.model,
      };
    case 'message.delta':
      return {
        ...pending,
        summarizing: false,
        assistantText: pending.assistantText + event.data.delta,
      };
    case 'context.summarizing':
      return { ...pending, summarizing: true };
    case 'context.updated':
      return { ...pending, context: event.data };
    case 'message.completed':
      return { ...pending, status: 'done' };
    case 'stream.error':
      return {
        ...pending,
        status: 'error',
        errorMessage: event.data.message,
      };
    case 'stream.cancelled':
      return { ...pending, status: 'done' };
    case 'heartbeat':
      return pending;
  }
}

export function describeTokens(message: ChatMessage): string[] {
  const details: string[] = [];
  if (message.model) details.push(`Model: ${message.model}`);
  if (message.promptTokens !== null) {
    details.push(`Prompt tokens: ${message.promptTokens}`);
  }
  if (message.completionTokens !== null) {
    details.push(`Completion tokens: ${message.completionTokens}`);
  }
  if (message.totalTokens !== null) {
    details.push(`Total tokens: ${message.totalTokens}`);
  }
  if (message.tokenCount !== null) {
    const source = message.tokenCountSource.replace('_', ' ');
    details.push(`Message tokens: ${message.tokenCount} (${source})`);
  }
  if (message.finishReason) details.push(`Finish: ${message.finishReason}`);
  return details;
}

export function mergeMessages(pages: ChatMessage[][]): ChatMessage[] {
  const seen = new Set<string>();
  const merged: ChatMessage[] = [];
  for (const page of [...pages].reverse()) {
    for (const message of page) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      merged.push(message);
    }
  }
  return merged;
}

export const PENDING_PROMPT_ID = 'pending-prompt';

export function isPendingVisible(
  pending: PendingStream | null,
): pending is PendingStream {
  return pending?.status === 'streaming' && pending.userMessageId !== null;
}

export function visibleServerMessages({
  messages,
  pending,
}: PendingMessagesParams): ChatMessage[] {
  if (!pending) return messages;
  return messages.filter(
    (message) =>
      message.id !== pending.userMessageId &&
      message.id !== pending.assistantMessageId,
  );
}

export function collectPrompts({
  messages,
  pending,
}: PendingMessagesParams): PromptSummary[] {
  const prompts = visibleServerMessages({ messages, pending })
    .filter((message) => message.role === 'user')
    .map((message) => ({
      id: message.id,
      preview: collapseWhitespace(message.content),
    }));
  if (isPendingVisible(pending)) {
    prompts.push({
      id: PENDING_PROMPT_ID,
      preview: collapseWhitespace(pending.userContent),
    });
  }
  return prompts;
}

export const MIN_NAVIGATOR_PROMPTS = 3;

export function shouldShowNavigator({
  promptCount,
  isOverflowing,
}: {
  promptCount: number;
  isOverflowing: boolean;
}): boolean {
  return isOverflowing && promptCount >= MIN_NAVIGATOR_PROMPTS;
}
