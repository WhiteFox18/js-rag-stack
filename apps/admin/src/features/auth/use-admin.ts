import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isUnauthorized } from '../../lib/api';

export const ADMIN_QUERY_KEY = ['admin', 'me'] as const;

export function useAdmin() {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: () => api.getMe(),
    retry: (count, error) => !isUnauthorized(error) && count < 1,
  });
  return {
    admin: query.data?.admin ?? null,
    isLoading: query.isPending,
    isUnauthorized: query.isError && isUnauthorized(query.error),
    error: query.error,
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
