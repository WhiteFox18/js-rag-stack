import type {
  ChatContext,
  ChatMessage,
  ChatStreamEvent,
  ChatSummary,
  HealthResponse,
  ModelsResponse,
} from '@js-rag-stack/contracts';
import { createHttp, toApiError, toQuery } from './http.js';

export { ApiClientError, type ApiErrorBody } from './http.js';
export * from './admin.js';

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthSession {
  id: string;
  userAgent: string | null;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'degraded' | 'unavailable';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    ollama: 'up' | 'down';
  };
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface ChatPage {
  chats: ChatSummary[];
  nextCursor: string | null;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
  nextCursor: string | null;
  context: ChatContext;
}

export interface CreateChatInput {
  model: string;
  title?: string;
  firstPrompt?: string;
}

export interface UpdateChatInput {
  title?: string;
  model?: string;
  archived?: boolean;
}

export interface StreamMessageInput {
  content: string;
  model?: string;
}

export interface StreamMessageOptions {
  chatId: string;
  input: StreamMessageInput;
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}

export function createApiClient({
  baseUrl,
  fetchImpl = fetch,
}: ApiClientOptions) {
  const { root, request, mutation } = createHttp({
    baseUrl,
    fetchImpl,
    csrfPath: '/auth/csrf',
  });

  return {
    getHealth: () => request<HealthResponse>('/health'),
    getReadiness: () => request<ReadinessResponse>('/health/ready'),
    signUp: (input: SignUpInput) =>
      mutation<AuthResponse>('/auth/sign-up', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    signIn: (input: SignInInput) =>
      mutation<AuthResponse>('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    refresh: () => mutation<AuthResponse>('/auth/refresh', { method: 'POST' }),
    signOut: () => mutation<void>('/auth/sign-out', { method: 'POST' }),
    signOutAll: () => mutation<void>('/auth/sign-out-all', { method: 'POST' }),
    getMe: () => request<AuthResponse>('/auth/me'),
    listSessions: () => request<AuthSession[]>('/auth/sessions'),
    revokeSession: (sessionId: string) =>
      mutation<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }),
    getModels: () => request<ModelsResponse>('/models'),
    listChats: (
      params: {
        cursor?: string;
        limit?: number;
        includeArchived?: boolean;
      } = {},
    ) => request<ChatPage>(`/chats${toQuery(params)}`),
    getChat: (
      chatId: string,
      params: { cursor?: string; limit?: number } = {},
    ) =>
      request<ChatDetail>(
        `/chats/${encodeURIComponent(chatId)}${toQuery(params)}`,
      ),
    createChat: (input: CreateChatInput) =>
      mutation<ChatSummary>('/chats', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateChat: (chatId: string, input: UpdateChatInput) =>
      mutation<ChatSummary>(`/chats/${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    deleteChat: (chatId: string) =>
      mutation<void>(`/chats/${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      }),
    streamMessage: async ({
      chatId,
      input,
      signal,
      onEvent,
    }: StreamMessageOptions): Promise<void> => {
      const csrf = await request<{ csrfToken: string }>('/auth/csrf');
      const response = await fetchImpl(
        `${root}/api/v1/chats/${encodeURIComponent(chatId)}/messages/stream`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            Accept: 'text/event-stream',
            'X-CSRF-Token': csrf.csrfToken,
          },
          body: JSON.stringify(input),
          signal,
        },
      );
      if (!response.ok) throw await toApiError(response);
      if (!response.body) throw new Error('The stream response has no body.');
      await consumeSse(response.body, onEvent);
    },
  };
}

async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event) onEvent(event);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const event = parseSseFrame(buffer);
    if (event) onEvent(event);
  }
}

function parseSseFrame(frame: string): ChatStreamEvent | undefined {
  if (!frame || frame.startsWith(':')) return undefined;
  let eventName = '';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!eventName || data.length === 0) return undefined;
  return {
    event: eventName,
    data: JSON.parse(data.join('\n')) as unknown,
  } as ChatStreamEvent;
}
