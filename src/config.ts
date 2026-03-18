import * as dotenv from 'dotenv'
import { cleanEnv, str, port } from "envalid";

dotenv.config({ path: `${__dirname}/../.env` })

const constants = cleanEnv(process.env, {
    LOG_LEVEL: str({
      choices: ["trace", "debug", "info", "warn", "error", "fatal", "silent"], default: "info"
    }),
    LOG_CHANNEL: str(),
    BOT_TOKEN: str(),
    BOT_USERNAME: str(),
    OWNER_ID: str(),
    SUPERUSERS: str(),
    START_GIF: str(),
    ADDED_TO_CHAT_GIF: str(),
    DATABASE_URL: str(),
    REDIS_CACHE_URL: str(),
    GRAMJS_API_ID: str(),
    GRAMJS_API_HASH: str(),
    GRAMJS_STRING_SESSION: str({ default: "", desc: "GramJS string session for bot login" }),
    // Clients list (manual commands)
    CLIENTS_ENABLED: str({ default: "false" }),
    CLIENTS_TARGET_CHAT_ID: str({ default: "" }),
    CLIENTS_REPOST_HOURS: str({ default: "2" }),
    CLIENTS_DELETE_PREVIOUS: str({ default: "true" }),
    CLIENTS_FIRE_ON_START: str({ default: "true" }),
    // Auto post clients scheduler
    AUTO_POSTCLIENTS_ENABLED: str({ default: "false" }),
    AUTO_POSTCLIENTS_INTERVAL_MINUTES: str({ default: "15" }),
    // Ads rotator
    ADS_ENABLED: str({ default: "false" }),
    ADS_SOURCE_CHAT_ID: str({ default: "" }),
    ADS_SOURCE_MESSAGE_IDS: str({ default: "" }),
    ADS_SOURCE_MESSAGE_ID: str({ default: "" }),
    ADS_TARGET_CHAT_ID: str({ default: "" }),
    ADS_INTERVAL_MINUTES: str({ default: "30" }),
    ADS_SPACING_SECONDS: str({ default: "300" }),
    ADS_FIRE_ON_START: str({ default: "false" }),
    // Ad publishing (/createad workflow)
    ADS_PUBLISHER_BOT_TOKEN: str({ default: "" }),
    ADS_TARGET_CHAT_ID_2: str({ default: "" }),
    ADS_TARGET_CHAT_LABEL: str({ default: "Pagrindinė grupė" }),
    ADS_TARGET_CHAT_LABEL_2: str({ default: "Reklamos kanalas" }),
    // Ad queue / traffic control
    ADS_MIN_SPACING_MINUTES: str({ default: "15" }),
    ADS_QUEUE_ENABLED: str({ default: "true" }),
    ADS_MAX_QUEUE_SIZE: str({ default: "20" }),
    // Ad rotation pool
    ADS_ROTATION_ENABLED: str({ default: "false" }),
    ADS_ROTATION_INTERVAL_MINUTES: str({ default: "15" }),
    ADS_ROTATION_RANDOMIZE: str({ default: "true" }),
    // Referral system
    GROUP_ID: str({ default: "" }),
    GROUP_INVITE_URL: str({ default: "" }),
    REF_REQUIRE_GROUP_JOIN: str({ default: "true" }),
    REF_JOIN_WINDOW_HOURS: str({ default: "24" }),
    REF_DAILY_CAP: str({ default: "20" }),
});

export default constants;
