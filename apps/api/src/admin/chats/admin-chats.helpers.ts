import type { AdminChatDetail, AdminChatOwner } from '@js-rag-stack/contracts';
import type { AdminChatRecord } from './admin-chats.types';

type OwnerSource = Pick<AdminChatRecord, 'user' | 'anonymous_session_id'>;

function toOwner(record: OwnerSource): AdminChatOwner {
  if (record.user) {
    return { type: 'user', id: record.user.id, email: record.user.email };
  }
  if (record.anonymous_session_id) {
    return { type: 'anonymous', id: record.anonymous_session_id };
  }
  return null;
}

export function toAdminChatDetail(
  record: Pick<
    AdminChatRecord,
    | 'id'
    | 'title'
    | 'created_at'
    | 'last_message_at'
    | 'archived_at'
    | 'selected_model'
    | 'user'
    | 'anonymous_session_id'
  > & {
    messages: Pick<
      AdminChatRecord['messages'][number],
      | 'id'
      | 'role'
      | 'status'
      | 'content'
      | 'model'
      | 'created_at'
      | 'prompt_tokens'
      | 'completion_tokens'
    >[];
  },
): AdminChatDetail {
  return {
    chat: {
      id: record.id,
      title: record.title,
      model: record.selected_model.name,
      createdAt: record.created_at.toISOString(),
      lastMessageAt: record.last_message_at.toISOString(),
      archivedAt: record.archived_at?.toISOString() ?? null,
      owner: toOwner(record),
    },
    messages: record.messages.map((m) => ({
      id: m.id,
      role: m.role === 'USER' ? 'user' : 'assistant',
      status:
        m.status.toLowerCase() as AdminChatDetail['messages'][number]['status'],
      content: m.content,
      model: m.model,
      createdAt: m.created_at.toISOString(),
      promptTokens: m.prompt_tokens,
      completionTokens: m.completion_tokens,
    })),
  };
}
