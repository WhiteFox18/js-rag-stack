-- Model registry: the single allowlist and per-model settings.
CREATE TABLE "model" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(200) NOT NULL,
    "max_context" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "model_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "model_max_context_check" CHECK ("max_context" > 0)
);

CREATE UNIQUE INDEX "model_name_key" ON "model"("name");

INSERT INTO "model" ("name", "max_context", "updated_at")
VALUES ('qwen2.5:1.5b', 8192, CURRENT_TIMESTAMP);

-- Keep every existing chat valid, even if it used a model no longer configured.
INSERT INTO "model" ("name", "max_context", "updated_at")
SELECT DISTINCT "chat"."selected_model", 8192, CURRENT_TIMESTAMP
FROM "chat"
WHERE NOT EXISTS (
    SELECT 1 FROM "model" WHERE "model"."name" = "chat"."selected_model"
);

ALTER TABLE "chat" ADD COLUMN "selected_model_id" UUID;

UPDATE "chat"
SET "selected_model_id" = "model"."id"
FROM "model"
WHERE "model"."name" = "chat"."selected_model";

ALTER TABLE "chat" ALTER COLUMN "selected_model_id" SET NOT NULL;
ALTER TABLE "chat" DROP COLUMN "selected_model";

CREATE INDEX "chat_selected_model_id_idx" ON "chat"("selected_model_id");

ALTER TABLE "chat" ADD CONSTRAINT "chat_selected_model_id_fkey"
    FOREIGN KEY ("selected_model_id") REFERENCES "model"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Running summary of the turns folded out of a chat's context window.
CREATE TABLE "conversation_summary" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "chat_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "summarized_through_message_id" UUID NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_summary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_summary_chat_id_key" ON "conversation_summary"("chat_id");

ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_summarized_through_message_id_fkey"
    FOREIGN KEY ("summarized_through_message_id") REFERENCES "message"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
