import { useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { deriveChatTitle, mergeMessages } from './chat.helpers';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { ModelSelector } from './model-selector';
import { useChatStream } from './use-chat-stream';

interface ModelOverride {
  scope: string;
  model: string;
}

export function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pending, send, cancel, dismissError } = useChatStream();
  const [override, setOverride] = useState<ModelOverride | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const scope = chatId ?? 'new';

  const models = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const chat = useInfiniteQuery({
    queryKey: ['chats', 'detail', chatId],
    enabled: Boolean(chatId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.getChat(chatId ?? '', { cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const modelList = models.data?.models ?? [];
  const defaultModel =
    modelList.find((model) => model.default)?.name ??
    modelList[0]?.name ??
    null;
  const chatModel = chat.data?.pages[0]?.selectedModel ?? null;
  const activeModel =
    (override?.scope === scope ? override.model : null) ??
    chatModel ??
    defaultModel;
  const isBusy = pending?.status === 'streaming';
  const messages = mergeMessages(
    chat.data?.pages.map((page) => page.messages) ?? [],
  );

  const handleSend = async (content: string): Promise<boolean> => {
    if (!activeModel) return false;
    setSendError(null);
    dismissError();
    let targetId = chatId;

    if (!targetId) {
      try {
        const created = await api.createChat({
          model: activeModel,
          title: deriveChatTitle(content),
        });
        targetId = created.id;
        setOverride({ scope: created.id, model: activeModel });
        await queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
        void navigate(`/chats/${created.id}`);
      } catch (error) {
        setSendError(toErrorMessage(error));
        return false;
      }
    }

    return send({ chatId: targetId, content, model: activeModel });
  };

  const errorMessage =
    sendError ??
    (pending?.status === 'error' ? pending.errorMessage : null) ??
    (chat.isError ? toErrorMessage(chat.error) : null);
  const showEmpty =
    !chatId && !isBusy && messages.length === 0 && !chat.isPending;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="truncate text-sm font-medium text-slate-300">
          {chat.data?.pages[0]?.title ?? 'New chat'}
        </h1>
        <ModelSelector
          models={modelList}
          value={activeModel}
          disabled={isBusy}
          onChange={(model) => setOverride({ scope, model })}
        />
      </div>

      {chatId && chat.isPending ? (
        <p
          role="status"
          className="flex-1 px-4 py-8 text-center text-slate-500"
        >
          Loading conversation…
        </p>
      ) : showEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h2 className="text-2xl font-semibold text-slate-100">
            How can I help today?
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            {models.isError
              ? 'Models could not be loaded. Check that the API and Ollama are running.'
              : modelList.length === 0 && !models.isPending
                ? 'No allowed models are installed in Ollama yet.'
                : 'Ask anything. Your conversation streams from a local model.'}
          </p>
        </div>
      ) : (
        <MessageList
          messages={messages}
          pending={pending && pending.chatId === chatId ? pending : null}
          hasOlder={Boolean(chat.hasNextPage)}
          isLoadingOlder={chat.isFetchingNextPage}
          onLoadOlder={() => void chat.fetchNextPage()}
        />
      )}

      {errorMessage ? (
        <div
          role="alert"
          className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              setSendError(null);
              dismissError();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <Composer
        draftKey={`draft:${scope}`}
        isBusy={isBusy}
        disabled={!activeModel}
        onSend={handleSend}
        onStop={cancel}
      />
    </main>
  );
}
