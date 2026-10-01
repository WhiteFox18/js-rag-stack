import { createAdminApiClient } from '@js-rag-stack/api-client';
import { describe, expect, it, vi } from 'vitest';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createAdminApiClient', () => {
  it('refreshes once on 401 and retries the request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }),
      )
      .mockResolvedValueOnce(json(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(
        json(200, { admin: { id: 'a', email: 'a@b.co', displayName: null } }),
      )
      .mockResolvedValueOnce(
        json(200, { admin: { id: 'a', email: 'a@b.co', displayName: null } }),
      );
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await expect(client.getMe()).resolves.toMatchObject({ admin: { id: 'a' } });
    expect(
      fetchImpl.mock.calls.map((call) => String(call[0] as string)),
    ).toEqual([
      '/api/v1/admin/auth/me',
      '/api/v1/admin/auth/csrf',
      '/api/v1/admin/auth/refresh',
      '/api/v1/admin/auth/me',
    ]);
  });

  it('surfaces 401 when refresh fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }),
      )
      .mockResolvedValueOnce(json(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(
        json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      );
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await expect(client.getMe()).rejects.toMatchObject({ status: 401 });
  });

  it('serializes list queries, skipping empty values', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json(200, { items: [], page: 1, pageSize: 25, total: 0 }),
      );
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await client.listUsers({ search: '', sort: 'totalTokens', page: 2 });
    expect(String(fetchImpl.mock.calls[0]?.[0] as string)).toBe(
      '/api/v1/admin/users?sort=totalTokens&page=2',
    );
  });
});
