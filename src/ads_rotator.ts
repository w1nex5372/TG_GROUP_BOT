import { Bot, Context } from "grammy";
import IORedis from "ioredis";

type AdScheduleItem = {
    message_id: number;
    interval_minutes: number;
};

type AdRuntimeItem = {
    messageId: number;
    intervalMinutes: number;
};

const REDIS_LAST_POSTED_KEY = "ads_rotator:last_posted_at";
const REDIS_LAST_GLOBAL_KEY = "ads_rotator:last_global_posted_at";

function parsePositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value ?? "");
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

function parseScheduleFromEnv(): AdRuntimeItem[] {
    const rawSchedule = process.env.ADS_SCHEDULE?.trim();

    if (rawSchedule) {
        try {
            const parsed = JSON.parse(rawSchedule) as AdScheduleItem[];
            if (!Array.isArray(parsed)) {
                throw new Error("ADS_SCHEDULE must be a JSON array.");
            }

            const normalized = parsed
                .map((item) => ({
                    messageId: Number(item?.message_id),
                    intervalMinutes: Number(item?.interval_minutes),
                }))
                .filter(
                    (item) =>
                        Number.isInteger(item.messageId) &&
                        item.messageId > 0 &&
                        Number.isFinite(item.intervalMinutes) &&
                        item.intervalMinutes > 0
                );

            if (!normalized.length) {
                throw new Error("ADS_SCHEDULE has no valid items.");
            }

            return normalized;
        } catch (err) {
            console.error("[AdsRotator] Failed to parse ADS_SCHEDULE. Rotator disabled.", err);
            return [];
        }
    }

    const fallbackMessageId = Number(process.env.ADS_SOURCE_MESSAGE_ID);
    const fallbackIntervalMinutes = parsePositiveNumber(process.env.ADS_INTERVAL_MINUTES, 30);

    if (!Number.isInteger(fallbackMessageId) || fallbackMessageId <= 0) {
        return [];
    }

    return [
        {
            messageId: fallbackMessageId,
            intervalMinutes: fallbackIntervalMinutes,
        },
    ];
}

export function startAdsRotator<C extends Context>(bot: Bot<C>): void {
    const enabled = process.env.ADS_ENABLED === "true";
    if (!enabled) return;

    const sourceChatId = Number(process.env.ADS_SOURCE_CHAT_ID);
    const targetChatId = Number(process.env.ADS_TARGET_CHAT_ID);
    const fireOnStart = process.env.ADS_FIRE_ON_START === "true";
    const minGapSeconds = parseNonNegativeNumber(process.env.ADS_MIN_GAP_SECONDS, 60);
    const tickSeconds = parsePositiveNumber(process.env.ADS_TICK_SECONDS, 30);
    const schedule = parseScheduleFromEnv();

    if (!sourceChatId || !targetChatId) {
        console.error(
            "[AdsRotator] ADS_ENABLED=true but one or more required vars are missing: " +
            "ADS_SOURCE_CHAT_ID, ADS_TARGET_CHAT_ID. Rotator disabled."
        );
        return;
    }

    if (!schedule.length) {
        console.error(
            "[AdsRotator] No valid ad schedule found. Provide ADS_SCHEDULE or ADS_SOURCE_MESSAGE_ID. Rotator disabled."
        );
        return;
    }

    const minGapMs = minGapSeconds * 1000;
    const tickMs = tickSeconds * 1000;
    const schedulerStartedAt = Date.now();

    const lastPostedAtByMessageId = new Map<number, number>();
    let lastGlobalPostedAt = 0;
    let busy = false;

    const redisUrl = process.env.REDIS_CACHE_URL?.trim();
    const redis = redisUrl
        ? new IORedis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        })
        : null;

    const loadRedisState = async (): Promise<void> => {
        if (!redis) return;

        try {
            await redis.connect();
            const values = await redis.hgetall(REDIS_LAST_POSTED_KEY);
            Object.entries(values).forEach(([messageIdRaw, tsRaw]) => {
                const messageId = Number(messageIdRaw);
                const ts = Number(tsRaw);
                if (Number.isInteger(messageId) && messageId > 0 && Number.isFinite(ts) && ts > 0) {
                    lastPostedAtByMessageId.set(messageId, ts);
                }
            });

            const lastGlobalRaw = await redis.get(REDIS_LAST_GLOBAL_KEY);
            const parsedLastGlobal = Number(lastGlobalRaw);
            if (Number.isFinite(parsedLastGlobal) && parsedLastGlobal > 0) {
                lastGlobalPostedAt = parsedLastGlobal;
            }
        } catch (err) {
            console.error("[AdsRotator] Failed loading Redis state, continuing with in-memory state:", err);
        }
    };

    const persistPostedAt = async (messageId: number, postedAt: number): Promise<void> => {
        if (!redis) return;
        try {
            await redis.hset(REDIS_LAST_POSTED_KEY, String(messageId), String(postedAt));
            await redis.set(REDIS_LAST_GLOBAL_KEY, String(postedAt));
        } catch (err) {
            console.error("[AdsRotator] Failed persisting schedule state to Redis:", err);
        }
    };

    const getNextDueAt = (item: AdRuntimeItem): number => {
        const lastPostedAt = lastPostedAtByMessageId.get(item.messageId);
        if (lastPostedAt) {
            return lastPostedAt + item.intervalMinutes * 60 * 1000;
        }

        if (fireOnStart) {
            return 0;
        }

        return schedulerStartedAt + item.intervalMinutes * 60 * 1000;
    };

    const postAd = async (item: AdRuntimeItem): Promise<void> => {
        const postedAt = Date.now();

        try {
            await bot.api.copyMessage(targetChatId, sourceChatId, item.messageId);
            lastPostedAtByMessageId.set(item.messageId, postedAt);
            lastGlobalPostedAt = postedAt;
            await persistPostedAt(item.messageId, postedAt);

            const nextDueAt = new Date(postedAt + item.intervalMinutes * 60 * 1000).toISOString();
            console.log(`[AdsRotator] Posted message_id=${item.messageId}. Next due at ${nextDueAt}.`);
        } catch (err) {
            console.error(`[AdsRotator] Failed to post message_id=${item.messageId}:`, err);
        }
    };

    const tick = async (): Promise<void> => {
        if (busy) return;

        const now = Date.now();
        if (lastGlobalPostedAt > 0 && now - lastGlobalPostedAt < minGapMs) {
            return;
        }

        const due = schedule
            .map((item) => ({ item, dueAt: getNextDueAt(item) }))
            .filter((x) => x.dueAt <= now)
            .sort((a, b) => a.dueAt - b.dueAt);

        if (!due.length) return;

        busy = true;
        try {
            await postAd(due[0].item);
        } finally {
            busy = false;
        }
    };

    void (async () => {
        await loadRedisState();

        console.log(
            `[AdsRotator] Loaded schedule: ${JSON.stringify(
                schedule.map((item) => ({ message_id: item.messageId, interval_minutes: item.intervalMinutes }))
            )}. min_gap_seconds=${minGapSeconds}, tick_seconds=${tickSeconds}`
        );

        void tick();
        setInterval(() => {
            void tick();
        }, tickMs);
    })();
}
