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
    // Clients list
    CLIENTS_ENABLED: str({ default: "false" }),
    AUTO_POSTCLIENTS_ENABLED: str({ default: "false" }),
    AUTO_POSTCLIENTS_INTERVAL_MINUTES: str({ default: "60" }),
    CLIENTS_TARGET_CHAT_ID: str({ default: "" }),
    CLIENTS_REPOST_HOURS: str({ default: "2" }),
    CLIENTS_DELETE_PREVIOUS: str({ default: "true" }),
    CLIENTS_FIRE_ON_START: str({ default: "true" }),
    // Ads rotator
    ADS_ENABLED: str({ default: "false" }),
    ADS_SOURCE_CHAT_ID: str({ default: "" }),
    ADS_SOURCE_MESSAGE_IDS: str({ default: "" }),
    ADS_SOURCE_MESSAGE_ID: str({ default: "" }),
    ADS_TARGET_CHAT_ID: str({ default: "" }),
    ADS_INTERVAL_MINUTES: str({ default: "30" }),
    ADS_SPACING_SECONDS: str({ default: "300" }),
    ADS_FIRE_ON_START: str({ default: "false" }),
});

export default constants;
