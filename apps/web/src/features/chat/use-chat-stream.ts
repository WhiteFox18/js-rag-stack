import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, toErrorMessage } from '../../lib/api';
import { applyStreamEvent } from './chat.helpers';
import type { PendingStream, SendStreamParams } from './chat.types';

export function useChatStream() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingStream | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(
    async ({ chatId, content, model }: SendStreamParams): Promise<boolean> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      let accepted = false;
      setPending({
        chatId,
        status: 'streaming',
        userContent: content,
        userMessageId: null,
        assistantMessageId: null,
        model: null,
        assistantText: '',
        errorMessage: null,
        summarizing: false,
        context: null,
      });

      try {
        await api.streamMessage({
          chatId,
          input: { content, model },
          signal: controller.signal,
          onEvent: (event) => {
            if (event.event === 'stream.started') accepted = true;
            setPending((current) =>
              current ? applyStreamEvent({ pending: current, event }) : current,
            );
          },
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          const errorMessage = toErrorMessage(error);
          setPending((current) =>
            current ? { ...current, status: 'error', errorMessage } : current,
          );
        }
      } finally {
        controllerRef.current = null;
        await queryClient.invalidateQueries({ queryKey: ['chats'] });
        setPending((current) => (current?.status === 'error' ? current : null));
      }
      return accepted;
    },
    [queryClient],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  const dismissError = useCallback(() => setPending(null), []);

  return { pending, send, cancel, dismissError };
}
