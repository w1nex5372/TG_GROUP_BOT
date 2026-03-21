-- Add weekly_points column to users (resets every Monday after rewards)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_points" INTEGER NOT NULL DEFAULT 0;

-- Weekly winners history table
CREATE TABLE IF NOT EXISTS "weekly_winners" (
    "id"             SERIAL PRIMARY KEY,
    "user_id"        BIGINT NOT NULL,
    "username"       TEXT,
    "place"          INTEGER NOT NULL,
    "weekly_points"  INTEGER NOT NULL,
    "tokens_awarded" INTEGER NOT NULL,
    "week_start"     TIMESTAMP(3) NOT NULL,
    "awarded_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "weekly_winners_user_id_idx"   ON "weekly_winners"("user_id");
CREATE INDEX IF NOT EXISTS "weekly_winners_week_start_idx" ON "weekly_winners"("week_start");
