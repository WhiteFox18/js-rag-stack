import { ApiClientError, createApiClient } from '@js-rag-stack/api-client';

export const api = createApiClient({ baseUrl: '' });

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.name !== 'AbortError') {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
