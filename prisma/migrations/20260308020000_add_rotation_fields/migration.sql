-- Add rotation pool fields to ad_drafts
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "ad_mode" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "ad_drafts" ADD COLUMN IF NOT EXISTS "rotation_last_published_at" TIMESTAMP(3);
