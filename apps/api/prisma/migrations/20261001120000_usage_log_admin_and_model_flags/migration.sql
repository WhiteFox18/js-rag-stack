-- Model availability and the single default model.
ALTER TABLE "model" ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "model" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "model" ADD CONSTRAINT "model_default_is_available_check"
    CHECK (NOT "is_default" OR "is_available");
CREATE UNIQUE INDEX "model_single_default" ON "model" ("is_default") WHERE "is_default";
