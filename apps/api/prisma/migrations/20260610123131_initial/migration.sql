-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TokenCountSource" AS ENUM ('OLLAMA_REPORTED', 'ESTIMATED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousSession" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "refresh_jti" UUID NOT NULL,
    "user_agent" VARCHAR(512),
    "ip_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "selected_model" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Chat_exactly_one_owner_check" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1)
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "model" VARCHAR(200),
    "token_count" INTEGER,
    "token_count_source" "TokenCountSource" NOT NULL DEFAULT 'UNKNOWN',
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "finish_reason" VARCHAR(100),
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousSession_token_hash_key" ON "AnonymousSession"("token_hash");

-- CreateIndex
CREATE INDEX "AnonymousSession_expires_at_idx" ON "AnonymousSession"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refresh_token_hash_key" ON "AuthSession"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refresh_jti_key" ON "AuthSession"("refresh_jti");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_replaced_by_session_id_key" ON "AuthSession"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "AuthSession_user_id_idx" ON "AuthSession"("user_id");

-- CreateIndex
CREATE INDEX "AuthSession_refresh_jti_idx" ON "AuthSession"("refresh_jti");

-- CreateIndex
CREATE INDEX "AuthSession_expires_at_idx" ON "AuthSession"("expires_at");

-- CreateIndex
CREATE INDEX "Chat_user_id_last_message_at_idx" ON "Chat"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "Chat_anonymous_session_id_last_message_at_idx" ON "Chat"("anonymous_session_id", "last_message_at");

-- CreateIndex
CREATE INDEX "Message_chat_id_created_at_id_idx" ON "Message"("chat_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "AnonymousSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
