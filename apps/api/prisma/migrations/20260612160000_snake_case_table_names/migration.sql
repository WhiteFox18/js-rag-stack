-- Rename tables without recreating them so existing application data is preserved.
ALTER TABLE "User" RENAME TO "user";
ALTER TABLE "AnonymousSession" RENAME TO "anonymous_session";
ALTER TABLE "AuthSession" RENAME TO "auth_session";
ALTER TABLE "Chat" RENAME TO "chat";
ALTER TABLE "Message" RENAME TO "message";

-- Keep database-managed constraint names aligned with the mapped table names.
ALTER TABLE "user" RENAME CONSTRAINT "User_pkey" TO "user_pkey";
ALTER TABLE "anonymous_session" RENAME CONSTRAINT "AnonymousSession_pkey" TO "anonymous_session_pkey";
ALTER TABLE "auth_session" RENAME CONSTRAINT "AuthSession_pkey" TO "auth_session_pkey";
ALTER TABLE "chat" RENAME CONSTRAINT "Chat_pkey" TO "chat_pkey";
ALTER TABLE "chat" RENAME CONSTRAINT "Chat_exactly_one_owner_check" TO "chat_exactly_one_owner_check";
ALTER TABLE "message" RENAME CONSTRAINT "Message_pkey" TO "message_pkey";

ALTER INDEX "User_email_key" RENAME TO "user_email_key";
ALTER INDEX "AnonymousSession_token_hash_key" RENAME TO "anonymous_session_token_hash_key";
ALTER INDEX "AnonymousSession_expires_at_idx" RENAME TO "anonymous_session_expires_at_idx";
ALTER INDEX "AuthSession_refresh_token_hash_key" RENAME TO "auth_session_refresh_token_hash_key";
ALTER INDEX "AuthSession_refresh_jti_key" RENAME TO "auth_session_refresh_jti_key";
ALTER INDEX "AuthSession_replaced_by_session_id_key" RENAME TO "auth_session_replaced_by_session_id_key";
ALTER INDEX "AuthSession_user_id_idx" RENAME TO "auth_session_user_id_idx";
ALTER INDEX "AuthSession_refresh_jti_idx" RENAME TO "auth_session_refresh_jti_idx";
ALTER INDEX "AuthSession_expires_at_idx" RENAME TO "auth_session_expires_at_idx";
ALTER INDEX "Chat_user_id_last_message_at_idx" RENAME TO "chat_user_id_last_message_at_idx";
ALTER INDEX "Chat_anonymous_session_id_last_message_at_idx" RENAME TO "chat_anonymous_session_id_last_message_at_idx";
ALTER INDEX "Message_chat_id_created_at_id_idx" RENAME TO "message_chat_id_created_at_id_idx";

ALTER TABLE "auth_session" RENAME CONSTRAINT "AuthSession_user_id_fkey" TO "auth_session_user_id_fkey";
ALTER TABLE "auth_session" RENAME CONSTRAINT "AuthSession_replaced_by_session_id_fkey" TO "auth_session_replaced_by_session_id_fkey";
ALTER TABLE "chat" RENAME CONSTRAINT "Chat_user_id_fkey" TO "chat_user_id_fkey";
ALTER TABLE "chat" RENAME CONSTRAINT "Chat_anonymous_session_id_fkey" TO "chat_anonymous_session_id_fkey";
ALTER TABLE "message" RENAME CONSTRAINT "Message_chat_id_fkey" TO "message_chat_id_fkey";
