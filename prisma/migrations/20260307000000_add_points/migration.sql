-- Add points column to users table
ALTER TABLE "users" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
