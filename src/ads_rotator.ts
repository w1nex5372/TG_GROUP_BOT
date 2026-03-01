import { Bot, Context } from "grammy";

export function startAdsRotator<C extends Context>(bot: Bot<C>): void {
    const enabled = process.env.ADS_ENABLED === "true";
    if (!enabled) return;

    const sourceChatId = Number(process.env.ADS_SOURCE_CHAT_ID);
    const sourceMessageId = Number(process.env.ADS_SOURCE_MESSAGE_ID);
    const targetChatId = Number(process.env.ADS_TARGET_CHAT_ID);
    const intervalMinutes = Number(process.env.ADS_INTERVAL_MINUTES || "30");
    const fireOnStart = process.env.ADS_FIRE_ON_START === "true";

    if (!sourceChatId || !sourceMessageId || !targetChatId) {
        console.error(
            "[AdsRotator] ADS_ENABLED=true but one or more required vars are missing: " +
            "ADS_SOURCE_CHAT_ID, ADS_SOURCE_MESSAGE_ID, ADS_TARGET_CHAT_ID. Rotator disabled."
        );
        return;
    }

    if (intervalMinutes <= 0 || !Number.isFinite(intervalMinutes)) {
        console.error("[AdsRotator] ADS_INTERVAL_MINUTES must be a positive number. Rotator disabled.");
        return;
    }

    let busy = false;

    const forward = async () => {
        if (busy) {
            console.log("[AdsRotator] Previous forward still in progress, skipping.");
            return;
        }
        busy = true;
        try {
            await bot.api.forwardMessage(targetChatId, sourceChatId, sourceMessageId);
            console.log(
                `[AdsRotator] Forwarded message ${sourceMessageId} from ${sourceChatId} to ${targetChatId}.`
            );
        } catch (err) {
            console.error("[AdsRotator] Failed to forward message:", err);
        } finally {
            busy = false;
        }
    };

    if (fireOnStart) {
        forward();
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    setInterval(forward, intervalMs);

    console.log(
        `[AdsRotator] Started. Forwarding message ${sourceMessageId} from ${sourceChatId} ` +
        `to ${targetChatId} every ${intervalMinutes} minute(s).` +
        (fireOnStart ? " (firing immediately on start)" : "")
    );
}
