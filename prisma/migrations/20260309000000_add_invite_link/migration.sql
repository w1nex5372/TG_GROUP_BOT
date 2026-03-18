-- Add per-user generated Telegram invite link to referral_events
ALTER TABLE "referral_events" ADD COLUMN "invite_link" TEXT;
