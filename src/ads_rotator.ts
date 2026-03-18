import { Bot, Context } from "grammy";

function parseSourceMessageIds(): number[] {
    const sourceMessageIdsRaw = (process.env.ADS_SOURCE_MESSAGE_IDS || "").trim();
    const sourceMessageIdLegacyRaw = (process.env.ADS_SOURCE_MESSAGE_ID || "").trim();

    const rawIds = sourceMessageIdsRaw
        ? sourceMessageIdsRaw.split(",").map((value) => value.trim()).filter(Boolean)
        : (sourceMessageIdLegacyRaw ? [sourceMessageIdLegacyRaw] : []);

    return rawIds
        .map((value) => Number(value))
        .filter((messageId) => Number.isFinite(messageId) && messageId > 0);
}

export function startAdsRotator<C extends Context>(bot: Bot<C>): void {
    const enabled = process.env.ADS_ENABLED === "true";
    const sourceChatIdRaw = (process.env.ADS_SOURCE_CHAT_ID || "").trim();
    const targetChatIdRaw = (process.env.ADS_TARGET_CHAT_ID || "").trim();
    const sourceMessageIdsRaw = (process.env.ADS_SOURCE_MESSAGE_IDS || "").trim();
    const sourceMessageIdLegacyRaw = (process.env.ADS_SOURCE_MESSAGE_ID || "").trim();
    const intervalMinutesRaw = process.env.ADS_INTERVAL_MINUTES || "30";
    const spacingSecondsRaw = process.env.ADS_SPACING_SECONDS || "300";
    const fireOnStartRaw = process.env.ADS_FIRE_ON_START === "true";

    console.log("[AdsRotator] ENV:", {
        enabled,
        sourceChatIdRaw,
        targetChatIdRaw,
        sourceMessageIdsRaw,
        sourceMessageIdLegacyRaw,
        intervalMinutes: intervalMinutesRaw,
        spacingSeconds: spacingSecondsRaw,
        fireOnStart: fireOnStartRaw,
    });

    if (!enabled) return;

    const hasMessageSource = Boolean(sourceMessageIdsRaw || sourceMessageIdLegacyRaw);
    if (!sourceChatIdRaw || !targetChatIdRaw || !hasMessageSource) {
        console.error(
            "[AdsRotator] ADS_ENABLED=true but one or more required vars are missing: " +
            "ADS_SOURCE_CHAT_ID, ADS_TARGET_CHAT_ID, and (ADS_SOURCE_MESSAGE_IDS or ADS_SOURCE_MESSAGE_ID). Rotator disabled."
        );
        return;
    }

    const sourceChatId = Number(sourceChatIdRaw);
    const sourceMessageIds = parseSourceMessageIds();
    const targetChatId = Number(targetChatIdRaw);
    const intervalMinutes = Number(intervalMinutesRaw);
    const spacingSeconds = Number(spacingSecondsRaw);
    const fireOnStart = fireOnStartRaw;

    if (!sourceChatId || sourceMessageIds.length === 0 || !targetChatId) {
        console.error(
            "[AdsRotator] ADS_ENABLED=true but one or more ad identifiers are invalid. " +
            "Check ADS_SOURCE_CHAT_ID, ADS_TARGET_CHAT_ID, and ADS_SOURCE_MESSAGE_IDS/ADS_SOURCE_MESSAGE_ID. Rotator disabled."
        );
        return;
    }

    if (intervalMinutes <= 0 || !Number.isFinite(intervalMinutes)) {
        console.error("[AdsRotator] ADS_INTERVAL_MINUTES must be a positive number. Rotator disabled.");
        return;
    }

    if (spacingSeconds < 0 || !Number.isFinite(spacingSeconds)) {
        console.error("[AdsRotator] ADS_SPACING_SECONDS must be a non-negative number. Rotator disabled.");
        return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    const maxSpacingMs = sourceMessageIds.length > 1 ? intervalMs / (sourceMessageIds.length - 1) : 0;
    const requestedSpacingMs = spacingSeconds * 1000;
    const spacingMs = sourceMessageIds.length > 1 ? Math.min(requestedSpacingMs, maxSpacingMs) : 0;

    if (sourceMessageIds.length > 1 && requestedSpacingMs > maxSpacingMs) {
        console.warn(
            `[AdsRotator] ADS_SPACING_SECONDS=${spacingSeconds} is too large for ${sourceMessageIds.length} ads in a ${intervalMinutes} minute cycle. ` +
            `Capping spacing to ${(spacingMs / 1000).toFixed(2)} second(s).`
        );
    }

    const sendAd = async (messageId: number, delayMs: number) => {
        try {
            await bot.api.forwardMessage(targetChatId, sourceChatId, messageId);
            console.log(
                `[AdsRotator] Sent message_id=${messageId} with scheduled_delay_ms=${delayMs} from ${sourceChatId} to ${targetChatId}.`
            );
        } catch (err) {
            console.error(`[AdsRotator] Failed to send message_id=${messageId}:`, err);
        }
    };

    const scheduleCycle = () => {
        sourceMessageIds.forEach((messageId, index) => {
            const delayMs = Math.round(index * spacingMs);
            console.log(`[AdsRotator] Scheduling message_id=${messageId} with delay_ms=${delayMs}.`);

            if (delayMs === 0) {
                void sendAd(messageId, delayMs);
                return;
            }

            setTimeout(() => {
                void sendAd(messageId, delayMs);
            }, delayMs);
        });
    };

    if (fireOnStart) {
        scheduleCycle();
    }

    setInterval(scheduleCycle, intervalMs);

    console.log(
        `[AdsRotator] Started. ${sourceMessageIds.length} ad(s) from ${sourceChatId} to ${targetChatId}. ` +
        `Cycle=${intervalMinutes} minute(s), spacing=${(spacingMs / 1000).toFixed(2)} second(s).` +
        (fireOnStart ? " (firing immediately on start)" : "")
    );
}
