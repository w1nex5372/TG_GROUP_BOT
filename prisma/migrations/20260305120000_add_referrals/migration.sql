-- AlterTable: add referral fields to users
ALTER TABLE "users" ADD COLUMN "ref_code" TEXT;
ALTER TABLE "users" ADD COLUMN "referred_by" BIGINT;
ALTER TABLE "users" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: unique ref_code per user
CREATE UNIQUE INDEX "users_ref_code_key" ON "users"("ref_code");

-- CreateTable: referral_events
CREATE TABLE "referral_events" (
    "id" SERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "referred_id" BIGINT NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one referral per referred user
CREATE UNIQUE INDEX "referral_events_referred_id_key" ON "referral_events"("referred_id");

-- CreateIndex: fast lookups by referrer
CREATE INDEX "referral_events_referrer_id_idx" ON "referral_events"("referrer_id");
