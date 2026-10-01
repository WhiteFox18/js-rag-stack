import { ApiClientError, createAdminApiClient } from '@js-rag-stack/api-client';

export const api = createAdminApiClient({ baseUrl: '' });

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
