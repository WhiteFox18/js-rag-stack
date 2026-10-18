import { ApiClientError } from '@js-rag-stack/api-client';
import type { AdminChatSummaryState } from '@js-rag-stack/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

const POLL_MS = 2000;

function isConflict(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 409 &&
    error.code === 'SUMMARY_IN_PROGRESS'
  );
}

export function useChatSummary(chatId: string): {
  state: AdminChatSummaryState | undefined;
  isLoading: boolean;
  isUpdating: boolean;
  error: unknown;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const queryKey = ['chats', chatId, 'summary'];
  // Another refresh holds the lock: poll until the GET reports it finished.
  const [conflict, setConflict] = useState(false);
  const conflictAt = useRef(0);
  const attempted = useRef<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => api.getChatSummary(chatId),
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 1,
    refetchInterval: (q) =>
      q.state.data?.generating || conflict ? POLL_MS : false,
  });

  const mutation = useMutation({
    mutationFn: () => api.refreshChatSummary(chatId),
    retry: false,
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, result);
    },
    onError: (error) => {
      if (isConflict(error)) {
        conflictAt.current = Date.now();
        attempted.current = null;
        setConflict(true);
      }
    },
  });

  const state = query.data;

  // A poll that landed after the conflict and shows no generation ends it.
  useEffect(() => {
    if (
      conflict &&
      state &&
      !state.generating &&
      query.dataUpdatedAt > conflictAt.current
    ) {
      setConflict(false);
    }
  }, [conflict, state, query.dataUpdatedAt]);

  const { mutate } = mutation;
  const pair = state
    ? `${state.summarizedThroughMessageId ?? ''}:${state.pendingMessages}`
    : null;
  useEffect(() => {
    if (
      state?.stale &&
      !state.generating &&
      !conflict &&
      !mutation.isPending &&
      attempted.current !== pair
    ) {
      attempted.current = pair;
      mutate();
    }
  }, [state, pair, conflict, mutation.isPending, mutate]);

  function retry() {
    attempted.current = pair;
    setConflict(false);
    if (!state) {
      void query.refetch();
      return;
    }
    mutation.reset();
    mutate();
  }

  return {
    state,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending || Boolean(state?.generating) || conflict,
    error: query.error ?? (isConflict(mutation.error) ? null : mutation.error),
    retry,
  };
}
