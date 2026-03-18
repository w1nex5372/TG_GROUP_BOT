-- CreateTable
CREATE TABLE "ad_drafts" (
    "id"                 SERIAL          NOT NULL,
    "created_by"         BIGINT          NOT NULL,
    "source_chat_id"     TEXT,
    "source_message_id"  BIGINT,
    "content_type"       TEXT            NOT NULL,
    "text"               TEXT,
    "caption"            TEXT,
    "media_file_id"      TEXT,
    "button_text"        TEXT,
    "button_url"         TEXT,
    "second_button_text" TEXT,
    "second_button_url"  TEXT,
    "target_chat_id"     TEXT            NOT NULL,
    "status"             TEXT            NOT NULL DEFAULT 'draft',
    "created_at"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at"       TIMESTAMP(3),

    CONSTRAINT "ad_drafts_pkey" PRIMARY KEY ("id")
);
