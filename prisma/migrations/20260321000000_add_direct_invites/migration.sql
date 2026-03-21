-- CreateTable: direct_invite_events
-- Tracks users directly added to the group by an admin/member (not via ref link).

CREATE TABLE "direct_invite_events" (
    "id"             SERIAL       PRIMARY KEY,
    "inviter_id"     BIGINT       NOT NULL,
    "invited_id"     BIGINT       NOT NULL,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "bot_started_at" TIMESTAMPTZ,
    CONSTRAINT "direct_invite_events_invited_id_key" UNIQUE ("invited_id")
);

CREATE INDEX "direct_invite_events_inviter_id_idx" ON "direct_invite_events"("inviter_id");
