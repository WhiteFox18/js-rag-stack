import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@js-rag-stack/api-client';
import { api, isUnauthorized } from '../../lib/api';

export const authUserKey = ['auth', 'me'] as const;

async function loadAuthUser(): Promise<AuthUser | null> {
  try {
    return (await api.getMe()).user;
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  try {
    return (await api.refresh()).user;
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
}

export function useAuthUser() {
  return useQuery({
    queryKey: authUserKey,
    queryFn: loadAuthUser,
    retry: false,
    refetchInterval: 10 * 60_000,
  });
}

export function useAuthActions() {
  const queryClient = useQueryClient();
  const reset = async () => {
    await queryClient.invalidateQueries();
  };

  const signIn = useMutation({
    mutationFn: api.signIn,
    onSuccess: reset,
  });
  const signUp = useMutation({
    mutationFn: api.signUp,
    onSuccess: reset,
  });
  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: async () => {
      queryClient.setQueryData(authUserKey, null);
      await reset();
    },
  });
  const signOutAll = useMutation({
    mutationFn: api.signOutAll,
    onSuccess: async () => {
      queryClient.setQueryData(authUserKey, null);
      await reset();
    },
  });

  return { signIn, signUp, signOut, signOutAll };
}
