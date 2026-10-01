-- Model availability and the single default model.
ALTER TABLE "model" ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "model" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "model" ADD CONSTRAINT "model_default_is_available_check"
    CHECK (NOT "is_default" OR "is_available");
CREATE UNIQUE INDEX "model_single_default" ON "model" ("is_default") WHERE "is_default";

-- Seed the historical default; the API seeds from OLLAMA_DEFAULT_MODEL when absent.
UPDATE "model" SET "is_default" = true WHERE "name" = 'qwen2.5:1.5b';

-- Append-only usage log, kept when chats or owners are deleted.
CREATE TYPE "UsageKind" AS ENUM ('CHAT', 'SUMMARY');

CREATE TABLE "usage_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "chat_id" UUID,
    "model_id" UUID NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_log_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0)
);

CREATE INDEX "usage_log_user_id_created_at_idx" ON "usage_log"("user_id", "created_at");
CREATE INDEX "usage_log_anonymous_session_id_created_at_idx" ON "usage_log"("anonymous_session_id", "created_at");
CREATE INDEX "usage_log_created_at_idx" ON "usage_log"("created_at");
CREATE INDEX "usage_log_model_id_idx" ON "usage_log"("model_id");

ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_anonymous_session_id_fkey"
    FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_model_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admin accounts with their own refresh sessions.
CREATE TABLE "admin" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100),
    "last_sign_in_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

CREATE TABLE "admin_session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "refresh_jti" UUID NOT NULL DEFAULT uuidv7(),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_session_refresh_token_hash_key" ON "admin_session"("refresh_token_hash");
CREATE UNIQUE INDEX "admin_session_refresh_jti_key" ON "admin_session"("refresh_jti");
CREATE INDEX "admin_session_admin_id_idx" ON "admin_session"("admin_id");
CREATE INDEX "admin_session_expires_at_idx" ON "admin_session"("expires_at");
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
