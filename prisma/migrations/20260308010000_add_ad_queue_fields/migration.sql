-- Add queue and publish metadata fields to ad_drafts
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "published_message_id" BIGINT;
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "published_chat_id" TEXT;
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "queued_at" TIMESTAMP(3);
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
