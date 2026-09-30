import type { OllamaHistoryMessage } from '../ollama/ollama.types';
import type {
  ChatHistoryEntry,
  ChunkEntriesParams,
  ContextBudget,
  ContextSettings,
  NeedsSummarizationParams,
  PromptEstimateParams,
  PromptMessagesParams,
  SelectTurnsToFoldParams,
  SummaryRequestParams,
} from './chats.types';

// Chat templates wrap every message in role markers; count them too.
export const MESSAGE_OVERHEAD_TOKENS = 4;
export const SUMMARY_PROMPT_OVERHEAD_TOKENS = 256;

const SUMMARY_INSTRUCTIONS = [
  'You maintain a running summary of a conversation between a user and an assistant.',
  'Update the summary with the new messages. Preserve facts, decisions, names, numbers,',
  'code identifiers, user preferences, and open questions. Drop pleasantries and repetition.',
  'Write concise prose in the same language as the conversation.',
  'Reply with the updated summary only.',
].join('\n');

export function getContextBudget(
  maxContext: number,
  settings: ContextSettings,
): ContextBudget {
  const summaryMaxTokens = Math.floor(maxContext * settings.summaryMaxRatio);
  return {
    trigger: Math.floor(maxContext * settings.summarizeAtRatio),
    target: Math.floor(maxContext * settings.targetRatio),
    summaryMaxTokens,
    chunkTokens: Math.max(
      1,
      maxContext - 2 * summaryMaxTokens - SUMMARY_PROMPT_OVERHEAD_TOKENS,
    ),
  };
}

export function estimateMessageTokens(
  text: string,
  charsPerToken: number,
): number {
  return Math.ceil(text.length / charsPerToken) + MESSAGE_OVERHEAD_TOKENS;
}

export function formatSummaryMessage(summary: string): string {
  return `Summary of the earlier conversation:\n${summary}`;
}

export function estimatePromptTokens({
  summary,
  turns,
  content,
  charsPerToken,
}: PromptEstimateParams): number {
  const texts = [
    ...(summary ? [formatSummaryMessage(summary)] : []),
    ...turns.map((entry) => entry.content),
    content,
  ];
  return texts.reduce(
    (total, text) => total + estimateMessageTokens(text, charsPerToken),
    0,
  );
}

// Ollama's reported usage is exact; if the estimate undershoots, the next
// turn still sees the real size and summarizes.
export function needsSummarization({
  estimate,
  lastReportedTokens,
  contentTokens,
  trigger,
}: NeedsSummarizationParams): boolean {
  const reported =
    lastReportedTokens === null ? 0 : lastReportedTokens + contentTokens;
  return Math.max(estimate, reported) > trigger;
}

export function entriesAfter(
  history: ChatHistoryEntry[],
  messageId: string | null,
): ChatHistoryEntry[] {
  if (messageId === null) return history;
  const index = history.findIndex((entry) => entry.id === messageId);
  return index === -1 ? history : history.slice(index + 1);
}

function isTurnBoundary(turns: ChatHistoryEntry[], index: number): boolean {
  return index === turns.length || turns[index]?.role === 'user';
}

export function selectTurnsToFold({
  turns,
  content,
  keepRecent,
  target,
  summaryTokens,
  charsPerToken,
}: SelectTurnsToFoldParams): number {
  const maxFoldable = Math.max(0, turns.length - keepRecent);
  let fold = 0;

  for (let index = 1; index <= maxFoldable; index += 1) {
    if (!isTurnBoundary(turns, index)) continue;
    fold = index;
    const remaining =
      summaryTokens +
      estimatePromptTokens({
        summary: null,
        turns: turns.slice(index),
        content,
        charsPerToken,
      });
    if (remaining <= target) break;
  }

  return fold;
}

export function dropOldestTurns({
  limit,
  ...params
}: PromptEstimateParams & { limit: number }): ChatHistoryEntry[] {
  let start = 0;

  while (
    start < params.turns.length &&
    estimatePromptTokens({ ...params, turns: params.turns.slice(start) }) >
      limit
  ) {
    start += 1;
    while (!isTurnBoundary(params.turns, start)) start += 1;
  }

  return params.turns.slice(start);
}

export function chunkEntries({
  entries,
  budget,
  charsPerToken,
}: ChunkEntriesParams): ChatHistoryEntry[][] {
  const chunks: ChatHistoryEntry[][] = [];
  let current: ChatHistoryEntry[] = [];
  let size = 0;

  for (const entry of entries) {
    const cost = estimateMessageTokens(entry.content, charsPerToken);
    if (current.length > 0 && size + cost > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += cost;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function buildSummaryRequest({
  previousSummary,
  entries,
  maxEntryChars,
}: SummaryRequestParams): OllamaHistoryMessage[] {
  const transcript = entries
    .map(
      (entry) =>
        `${entry.role === 'user' ? 'User' : 'Assistant'}: ${truncate(entry.content, maxEntryChars)}`,
    )
    .join('\n\n');
  return [
    { role: 'system', content: SUMMARY_INSTRUCTIONS },
    {
      role: 'user',
      content: `Current summary:\n${previousSummary ?? '(none)'}\n\nNew messages:\n${transcript}`,
    },
  ];
}

export function toPromptMessages({
  summary,
  turns,
  content,
}: PromptMessagesParams): OllamaHistoryMessage[] {
  return [
    ...(summary
      ? [{ role: 'system' as const, content: formatSummaryMessage(summary) }]
      : []),
    ...turns.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content },
  ];
}
