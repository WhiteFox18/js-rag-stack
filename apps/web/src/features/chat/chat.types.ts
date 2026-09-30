import type { AuthUser, ReadinessResponse } from '@js-rag-stack/api-client';
import type {
  ChatMessage,
  ChatStreamEvent,
  ChatSummary,
  ModelInfo,
} from '@js-rag-stack/contracts';

export interface PendingStream {
  chatId: string;
  status: 'streaming' | 'done' | 'error';
  userContent: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  model: string | null;
  assistantText: string;
  errorMessage: string | null;
}

export interface SendStreamParams {
  chatId: string;
  content: string;
  model: string;
}

export interface ApplyStreamEventParams {
  pending: PendingStream;
  event: ChatStreamEvent;
}

export interface ChatGroup {
  label: string;
  chats: ChatSummary[];
}

export interface GroupChatsParams {
  chats: ChatSummary[];
  now: Date;
}

export interface ChatSidebarProps {
  user: AuthUser | null;
  activeChatId: string | undefined;
  onNavigate: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

export interface ChatListItemProps {
  chat: ChatSummary;
  active: boolean;
  onNavigate: () => void;
}

export interface ChatGroupsProps {
  activeChatId: string | undefined;
  onNavigate: () => void;
}

export interface MessageListProps {
  messages: ChatMessage[];
  pending: PendingStream | null;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  scroll: ScrollTracking;
}

export interface ModelSelectorProps {
  models: ModelInfo[];
  value: string | null;
  disabled: boolean;
  onChange: (model: string) => void;
}

export interface ComposerProps {
  draftKey: string;
  isBusy: boolean;
  disabled: boolean;
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
}

export interface ReadinessBannerProps {
  readiness: ReadinessResponse;
}

export interface CodeBlockProps {
  code: string;
  lang: string | null;
  streaming: boolean;
}

export interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}

export interface UseScrollTrackingParams {
  promptIds: string[];
  resetKey: string;
}

export interface ScrollTracking {
  containerRef: (element: HTMLDivElement | null) => void;
  contentRef: (element: HTMLDivElement | null) => void;
  activePromptId: string | null;
  isOverflowing: boolean;
  isAtBottom: boolean;
  scrollToPrompt: (id: string) => void;
  scrollToBottom: () => void;
  preserveScrollPosition: () => void;
}

export interface PendingMessagesParams {
  messages: ChatMessage[];
  pending: PendingStream | null;
}

export interface PromptSummary {
  id: string;
  preview: string;
}

export interface UserMessageProps {
  id: string;
  content: string;
}

export interface AssistantMessageProps {
  content: string;
  streaming: boolean;
  status: ChatMessage['status'] | null;
  details: string[];
}
