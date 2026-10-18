-- Admin-only usage kind. The new value is not used in this migration.
ALTER TYPE "UsageKind" ADD VALUE 'ADMIN_SUMMARY';

-- Cached, incrementally updated admin summary of a chat.
CREATE TABLE "admin_chat_summary" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "chat_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "summarized_through_message_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_chat_summary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_chat_summary_chat_id_key" ON "admin_chat_summary"("chat_id");

ALTER TABLE "admin_chat_summary" ADD CONSTRAINT "admin_chat_summary_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_chat_summary" ADD CONSTRAINT "admin_chat_summary_summarized_through_message_id_fkey"
    FOREIGN KEY ("summarized_through_message_id") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_chat_summary" ADD CONSTRAINT "admin_chat_summary_model_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
