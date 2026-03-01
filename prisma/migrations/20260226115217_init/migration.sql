-- CreateTable
CREATE TABLE "access_connection" (
    "chat_id" VARCHAR(14) NOT NULL,
    "allow_connect_to_chat" BOOLEAN,

    CONSTRAINT "access_connection_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "afk_users" (
    "user_id" BIGSERIAL NOT NULL,
    "is_afk" BOOLEAN,
    "reason" TEXT,

    CONSTRAINT "afk_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "antiflood" (
    "chat_id" VARCHAR(14) NOT NULL,
    "user_id" BIGINT,
    "count" BIGINT,
    "limit" BIGINT,

    CONSTRAINT "antiflood_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "antiflood_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "flood_type" BIGINT,
    "value" TEXT,

    CONSTRAINT "antiflood_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "approval" (
    "chat_id" VARCHAR(14) NOT NULL,
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("chat_id","user_id")
);

-- CreateTable
CREATE TABLE "autokicks_safemode" (
    "chat_id" VARCHAR(14) NOT NULL,
    "timeK" BIGINT,

    CONSTRAINT "autokicks_safemode_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "bans_feds" (
    "fed_id" TEXT NOT NULL,
    "user_id" VARCHAR(14) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "user_name" TEXT,
    "reason" TEXT,
    "time" BIGINT,

    CONSTRAINT "bans_feds_pkey" PRIMARY KEY ("fed_id","user_id")
);

-- CreateTable
CREATE TABLE "blacklist" (
    "chat_id" VARCHAR(14) NOT NULL,
    "trigger" TEXT NOT NULL,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("chat_id","trigger")
);

-- CreateTable
CREATE TABLE "blacklist_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "blacklist_type" BIGINT,
    "value" TEXT,

    CONSTRAINT "blacklist_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "blacklist_stickers" (
    "chat_id" VARCHAR(14) NOT NULL,
    "trigger" TEXT NOT NULL,

    CONSTRAINT "blacklist_stickers_pkey" PRIMARY KEY ("chat_id","trigger")
);

-- CreateTable
CREATE TABLE "blacklistusers" (
    "user_id" VARCHAR(14) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "blacklistusers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "blsticker_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "blacklist_type" BIGINT,
    "value" TEXT,

    CONSTRAINT "blsticker_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "cas_stats" (
    "chat_id" VARCHAR(14) NOT NULL,
    "status" BOOLEAN,
    "autoban" BOOLEAN,

    CONSTRAINT "cas_stats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "chat_feds" (
    "chat_id" VARCHAR(14) NOT NULL,
    "chat_name" TEXT,
    "fed_id" TEXT,

    CONSTRAINT "chat_feds_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "chat_members" (
    "priv_chat_id" BIGSERIAL NOT NULL,
    "chat" VARCHAR(14) NOT NULL,
    "user" BIGINT NOT NULL,

    CONSTRAINT "chat_members_pkey" PRIMARY KEY ("priv_chat_id")
);

-- CreateTable
CREATE TABLE "chat_report_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "should_report" BOOLEAN,

    CONSTRAINT "chat_report_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "chatbot_chats" (
    "chat_id" VARCHAR(14) NOT NULL,
    "ses_id" VARCHAR(70),
    "expires" VARCHAR(15),

    CONSTRAINT "chatbot_chats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "chats" (
    "chat_id" VARCHAR(14) NOT NULL,
    "chat_name" TEXT NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "clean_service" (
    "chat_id" VARCHAR(14) NOT NULL,
    "clean_service" BOOLEAN,

    CONSTRAINT "clean_service_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "cleaner_bluetext_chat_ignore_commands" (
    "chat_id" TEXT NOT NULL,
    "command" TEXT NOT NULL,

    CONSTRAINT "cleaner_bluetext_chat_ignore_commands_pkey" PRIMARY KEY ("chat_id","command")
);

-- CreateTable
CREATE TABLE "cleaner_bluetext_chat_setting" (
    "chat_id" TEXT NOT NULL,
    "is_enable" BOOLEAN,

    CONSTRAINT "cleaner_bluetext_chat_setting_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "cleaner_bluetext_global_ignore_commands" (
    "command" TEXT NOT NULL,

    CONSTRAINT "cleaner_bluetext_global_ignore_commands_pkey" PRIMARY KEY ("command")
);

-- CreateTable
CREATE TABLE "connection" (
    "user_id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14),

    CONSTRAINT "connection_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "connection_history" (
    "user_id" BIGINT NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "chat_name" TEXT,
    "conn_time" BIGINT,

    CONSTRAINT "connection_history_pkey" PRIMARY KEY ("user_id","chat_id")
);

-- CreateTable
CREATE TABLE "filter_urls" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "keyword" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "same_line" BOOLEAN,

    CONSTRAINT "filter_urls_pkey" PRIMARY KEY ("id","chat_id","keyword")
);

-- CreateTable
CREATE TABLE "filters" (
    "chat_id" VARCHAR(14) NOT NULL,
    "keyword" TEXT NOT NULL,
    "reply" TEXT,
    "file" TEXT,
    "msgtype" BIGINT,

    CONSTRAINT "filters_pkey" PRIMARY KEY ("chat_id","keyword")
);

-- CreateTable
CREATE TABLE "cust_filter_urls" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "keyword" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "same_line" BOOLEAN,

    CONSTRAINT "cust_filter_urls_pkey" PRIMARY KEY ("id","chat_id","keyword")
);

-- CreateTable
CREATE TABLE "cust_filters" (
    "chat_id" VARCHAR(14) NOT NULL,
    "keyword" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "is_sticker" BOOLEAN NOT NULL,
    "is_document" BOOLEAN NOT NULL,
    "is_image" BOOLEAN NOT NULL,
    "is_audio" BOOLEAN NOT NULL,
    "is_voice" BOOLEAN NOT NULL,
    "is_video" BOOLEAN NOT NULL,
    "has_buttons" BOOLEAN NOT NULL,
    "has_markdown" BOOLEAN NOT NULL,
    "reply_text" TEXT,
    "file_type" BIGINT NOT NULL,
    "file_id" TEXT,

    CONSTRAINT "cust_filters_pkey" PRIMARY KEY ("chat_id","keyword")
);

-- CreateTable
CREATE TABLE "defense_mode" (
    "chat_id" VARCHAR(14) NOT NULL,
    "status" BOOLEAN,

    CONSTRAINT "defense_mode_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "disabled_commands" (
    "chat_id" VARCHAR(14) NOT NULL,
    "command" TEXT NOT NULL,

    CONSTRAINT "disabled_commands_pkey" PRIMARY KEY ("chat_id","command")
);

-- CreateTable
CREATE TABLE "feds" (
    "owner_id" VARCHAR(14),
    "fed_name" TEXT,
    "fed_id" TEXT NOT NULL,
    "fed_rules" TEXT,
    "fed_log" TEXT,
    "fed_users" TEXT,

    CONSTRAINT "feds_pkey" PRIMARY KEY ("fed_id")
);

-- CreateTable
CREATE TABLE "feds_settings" (
    "user_id" BIGSERIAL NOT NULL,
    "should_report" BOOLEAN,

    CONSTRAINT "feds_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "feds_subs" (
    "fed_id" TEXT NOT NULL,
    "fed_subs" TEXT NOT NULL,

    CONSTRAINT "feds_subs_pkey" PRIMARY KEY ("fed_id","fed_subs")
);

-- CreateTable
CREATE TABLE "gban_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "setting" BOOLEAN NOT NULL,

    CONSTRAINT "gban_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "gbans" (
    "user_id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "gbans_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "human_checks" (
    "user_id" BIGINT NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "human_check" BOOLEAN,

    CONSTRAINT "human_checks_pkey" PRIMARY KEY ("user_id","chat_id")
);

-- CreateTable
CREATE TABLE "last_fm" (
    "user_id" VARCHAR(14) NOT NULL,
    "username" VARCHAR(15),

    CONSTRAINT "last_fm_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "leave_urls" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "same_line" BOOLEAN,

    CONSTRAINT "leave_urls_pkey" PRIMARY KEY ("id","chat_id")
);

-- CreateTable
CREATE TABLE "locales" (
    "chat_id" VARCHAR(14) NOT NULL,
    "locale_name" TEXT,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "locks" (
    "chat_id" TEXT NOT NULL,
    "audio" BOOLEAN NOT NULL DEFAULT false,
    "bot" BOOLEAN NOT NULL DEFAULT false,
    "button" BOOLEAN NOT NULL DEFAULT false,
    "contact" BOOLEAN NOT NULL DEFAULT false,
    "document" BOOLEAN NOT NULL DEFAULT false,
    "emojigame" BOOLEAN NOT NULL DEFAULT false,
    "forward" BOOLEAN NOT NULL DEFAULT false,
    "game" BOOLEAN NOT NULL DEFAULT false,
    "gif" BOOLEAN NOT NULL DEFAULT false,
    "info" BOOLEAN NOT NULL DEFAULT false,
    "inline" BOOLEAN NOT NULL DEFAULT false,
    "invite" BOOLEAN NOT NULL DEFAULT false,
    "location" BOOLEAN NOT NULL DEFAULT false,
    "manage_topics" BOOLEAN NOT NULL DEFAULT false,
    "media" BOOLEAN NOT NULL DEFAULT false,
    "messages" BOOLEAN NOT NULL DEFAULT false,
    "other" BOOLEAN NOT NULL DEFAULT false,
    "photo" BOOLEAN NOT NULL DEFAULT false,
    "pin" BOOLEAN NOT NULL DEFAULT false,
    "poll" BOOLEAN NOT NULL DEFAULT false,
    "rtl" BOOLEAN NOT NULL DEFAULT false,
    "sticker" BOOLEAN NOT NULL DEFAULT false,
    "url" BOOLEAN NOT NULL DEFAULT false,
    "video" BOOLEAN NOT NULL DEFAULT false,
    "video_note" BOOLEAN NOT NULL DEFAULT false,
    "voice" BOOLEAN NOT NULL DEFAULT false,
    "web_page_preview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "locks_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "log_channels" (
    "chat_id" VARCHAR(14) NOT NULL,
    "log_channel" VARCHAR(14) NOT NULL,

    CONSTRAINT "log_channels_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "note_urls" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "note_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "same_line" BOOLEAN,

    CONSTRAINT "note_urls_pkey" PRIMARY KEY ("id","chat_id","note_name")
);

-- CreateTable
CREATE TABLE "notes" (
    "chat_id" VARCHAR(14) NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT,
    "file" TEXT,
    "is_reply" BOOLEAN,
    "has_buttons" BOOLEAN,
    "msgtype" BIGINT,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("chat_id","name")
);

-- CreateTable
CREATE TABLE "nsfw_chats" (
    "chat_id" VARCHAR(14) NOT NULL,

    CONSTRAINT "nsfw_chats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "chat_id" VARCHAR(14) NOT NULL,
    "audio" BOOLEAN DEFAULT false,
    "voice" BOOLEAN DEFAULT false,
    "document" BOOLEAN DEFAULT false,
    "video" BOOLEAN DEFAULT false,
    "contact" BOOLEAN DEFAULT false,
    "photo" BOOLEAN DEFAULT false,
    "url" BOOLEAN DEFAULT false,
    "bots" BOOLEAN DEFAULT false,
    "forward" BOOLEAN DEFAULT false,
    "game" BOOLEAN DEFAULT false,
    "location" BOOLEAN DEFAULT false,
    "egame" BOOLEAN DEFAULT false,
    "rtl" BOOLEAN DEFAULT false,
    "button" BOOLEAN DEFAULT false,
    "inline" BOOLEAN DEFAULT false,
    "poll" BOOLEAN DEFAULT false,
    "sticker" BOOLEAN DEFAULT false,
    "gif" BOOLEAN DEFAULT false,
    "videoNote" BOOLEAN DEFAULT false,
    "messages" BOOLEAN DEFAULT false,
    "media" BOOLEAN DEFAULT false,
    "other" BOOLEAN DEFAULT false,
    "previews" BOOLEAN DEFAULT false,
    "info" BOOLEAN DEFAULT false,
    "invite" BOOLEAN DEFAULT false,
    "pin" BOOLEAN DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "restrictions" (
    "chat_id" VARCHAR(14) NOT NULL,
    "messages" BOOLEAN,
    "media" BOOLEAN,
    "other" BOOLEAN,
    "preview" BOOLEAN,

    CONSTRAINT "restrictions_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "rss_feed" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "feed_link" TEXT,
    "old_entry_link" TEXT,

    CONSTRAINT "rss_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "chat_id" VARCHAR(14) NOT NULL,
    "rules" TEXT,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "spotifycreds" (
    "user_id" BIGSERIAL NOT NULL,
    "spotify_id" TEXT,
    "spotify_access_token" TEXT,
    "spotify_refresh_token" TEXT,

    CONSTRAINT "spotifycreds_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_report_settings" (
    "user_id" BIGSERIAL NOT NULL,
    "should_report" BOOLEAN,

    CONSTRAINT "user_report_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "userbio" (
    "user_id" BIGSERIAL NOT NULL,
    "bio" TEXT,

    CONSTRAINT "userbio_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "userinfo" (
    "user_id" BIGSERIAL NOT NULL,
    "info" TEXT,

    CONSTRAINT "userinfo_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" BIGSERIAL NOT NULL,
    "username" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "warn_filters" (
    "chat_id" VARCHAR(14) NOT NULL,
    "keyword" TEXT NOT NULL,
    "reply" TEXT NOT NULL,

    CONSTRAINT "warn_filters_pkey" PRIMARY KEY ("chat_id","keyword")
);

-- CreateTable
CREATE TABLE "warn_settings" (
    "chat_id" VARCHAR(14) NOT NULL,
    "warn_limit" BIGINT,
    "soft_warn" BOOLEAN,

    CONSTRAINT "warn_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "warns" (
    "user_id" BIGINT NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "num_warns" BIGINT,
    "reasons" TEXT[],

    CONSTRAINT "warns_pkey" PRIMARY KEY ("user_id","chat_id")
);

-- CreateTable
CREATE TABLE "welcome_mutes" (
    "chat_id" VARCHAR(14) NOT NULL,
    "welcomemutes" TEXT,

    CONSTRAINT "welcome_mutes_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "welcome_pref" (
    "chat_id" VARCHAR(14) NOT NULL,
    "should_welcome" BOOLEAN,
    "should_goodbye" BOOLEAN,
    "custom_content" TEXT,
    "custom_welcome" TEXT,
    "welcome_type" BIGINT,
    "custom_leave" TEXT,
    "leave_type" BIGINT,
    "clean_welcome" BOOLEAN,
    "previous_welcome" BIGINT,

    CONSTRAINT "welcome_pref_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "welcome_urls" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" VARCHAR(14) NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "same_line" BOOLEAN,

    CONSTRAINT "welcome_urls_pkey" PRIMARY KEY ("id","chat_id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "user_id" BIGINT NOT NULL,
    "anime_id" TEXT NOT NULL,
    "anime_title" TEXT NOT NULL,
    "anime_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("user_id","anime_id")
);

-- CreateTable
CREATE TABLE "user_characters" (
    "user_id" BIGINT NOT NULL,
    "character_id" TEXT NOT NULL,
    "character_name" TEXT NOT NULL,
    "character_image" TEXT,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_characters_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "_chat_members_uc" ON "chat_members"("chat", "user");

-- AddForeignKey
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_fkey" FOREIGN KEY ("chat") REFERENCES "chats"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_fkey" FOREIGN KEY ("user") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
