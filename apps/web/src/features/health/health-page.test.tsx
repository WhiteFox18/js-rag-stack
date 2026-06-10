import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HealthPage } from './health-page';

describe('HealthPage', () => {
  it('renders live API health', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'api',
          timestamp: '2026-06-10T12:00:00.000Z',
          uptimeSeconds: 42,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HealthPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('42s')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [request, init] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/v1/health');
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
