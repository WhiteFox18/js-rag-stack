export interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export interface HttpOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  csrfPath: string;
}

export function createHttp({
  baseUrl,
  fetchImpl = fetch,
  csrfPath,
}: HttpOptions) {
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${root}/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function mutation<T>(path: string, init: RequestInit): Promise<T> {
    const csrf = await request<{ csrfToken: string }>(csrfPath);
    return request<T>(path, {
      ...init,
      headers: { ...init.headers, 'X-CSRF-Token': csrf.csrfToken },
    });
  }

  return { root, fetchImpl, request, mutation };
}

export function toQuery(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export async function toApiError(response: Response): Promise<ApiClientError> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return new ApiClientError(
    response.status,
    body.error?.code ?? 'HTTP_ERROR',
    body.error?.message ?? `Request failed with status ${response.status}.`,
    body.error?.requestId,
  );
}
