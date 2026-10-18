import type {
  AdminAnonymousDetail,
  AdminAnonymousListItem,
  AdminAuthResponse,
  AdminChatDetail,
  AdminChatSummaryState,
  AdminModel,
  AdminModelsResponse,
  AdminSignInInput,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserSort,
  CreateModelInput,
  PageQuery,
  Paginated,
  UpdateModelInput,
  UsageRangeQuery,
  UsageRow,
} from '@js-rag-stack/contracts';
import { ApiClientError, createHttp, toQuery } from './http.js';

export type UsagePageQuery = PageQuery & UsageRangeQuery;
export type ListUsersQuery = UsagePageQuery & {
  search?: string;
  sort?: AdminUserSort;
};
export type ListAnonymousQuery = UsagePageQuery & { sort?: AdminUserSort };

export function createAdminApiClient({
  baseUrl,
  fetchImpl,
}: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const http = createHttp({ baseUrl, fetchImpl, csrfPath: '/admin/auth/csrf' });
  let refreshing: Promise<void> | null = null;

  async function authed<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401)
        throw error;
      refreshing ??= http
        .mutation<AdminAuthResponse>('/admin/auth/refresh', { method: 'POST' })
        .then(() => undefined)
        .finally(() => {
          refreshing = null;
        });
      await refreshing;
      return call();
    }
  }

  const get = <T>(path: string) => authed(() => http.request<T>(path));
  const id = (value: string) => encodeURIComponent(value);

  return {
    signIn: (input: AdminSignInInput) =>
      http.mutation<AdminAuthResponse>('/admin/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    signOut: () =>
      authed(() =>
        http.mutation<void>('/admin/auth/sign-out', { method: 'POST' }),
      ),
    getMe: () => get<AdminAuthResponse>('/admin/auth/me'),
    listUsers: (query: ListUsersQuery = {}) =>
      get<Paginated<AdminUserListItem>>(`/admin/users${toQuery(query)}`),
    getUser: (userId: string, range: UsageRangeQuery = {}) =>
      get<AdminUserDetail>(`/admin/users/${id(userId)}${toQuery(range)}`),
    getUserUsage: (userId: string, query: UsagePageQuery = {}) =>
      get<Paginated<UsageRow>>(
        `/admin/users/${id(userId)}/usage${toQuery(query)}`,
      ),
    listAnonymousSessions: (query: ListAnonymousQuery = {}) =>
      get<Paginated<AdminAnonymousListItem>>(
        `/admin/anonymous-sessions${toQuery(query)}`,
      ),
    getAnonymousSession: (sessionId: string, range: UsageRangeQuery = {}) =>
      get<AdminAnonymousDetail>(
        `/admin/anonymous-sessions/${id(sessionId)}${toQuery(range)}`,
      ),
    getAnonymousSessionUsage: (sessionId: string, query: UsagePageQuery = {}) =>
      get<Paginated<UsageRow>>(
        `/admin/anonymous-sessions/${id(sessionId)}/usage${toQuery(query)}`,
      ),
    getChat: (chatId: string) =>
      get<AdminChatDetail>(`/admin/chats/${id(chatId)}`),
    getChatSummary: (chatId: string) =>
      get<AdminChatSummaryState>(`/admin/chats/${id(chatId)}/summary`),
    refreshChatSummary: (chatId: string) =>
      authed(() =>
        http.mutation<AdminChatSummaryState>(
          `/admin/chats/${id(chatId)}/summary`,
          { method: 'POST' },
        ),
      ),
    listModels: () => get<AdminModelsResponse>('/admin/models'),
    createModel: (input: CreateModelInput) =>
      authed(() =>
        http.mutation<AdminModel>('/admin/models', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    updateModel: (modelId: string, input: UpdateModelInput) =>
      authed(() =>
        http.mutation<AdminModel>(`/admin/models/${id(modelId)}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      ),
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
