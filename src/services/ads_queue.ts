/**
 * ads_queue.ts
 *
 * Periodic scheduler (60 s tick) that:
 *   1. Publishes the next queued ad when the spacing window allows (queue priority).
 *   2. Falls back to the rotation pool when the queue is empty.
 *
 * All state is persisted in PostgreSQL — survives restarts.
 */

import constants from "../config";
import {
    getQueuedAds,
    getRotationAds,
    updateAdDraft,
    getLastRotationPublishTime,
} from "../database/ads_sql";
import { publishDraftViaPublisherBot } from "./ads_publisher";
import { bot } from "../bot";

// ── Config helpers (exported for use in ads.ts commands) ──────────────────────

export function getMinSpacingMs(): number {
    return parseInt(constants.ADS_MIN_SPACING_MINUTES || "15", 10) * 60_000;
}

export function isQueueEnabled(): boolean {
    return (constants.ADS_QUEUE_ENABLED || "true").toLowerCase() === "true";
}

export function getMaxQueueSize(): number {
    return parseInt(constants.ADS_MAX_QUEUE_SIZE || "20", 10);
}

export function isRotationEnabled(): boolean {
    return (constants.ADS_ROTATION_ENABLED || "false").toLowerCase() === "true";
}

export function getRotationIntervalMs(): number {
    return parseInt(constants.ADS_ROTATION_INTERVAL_MINUTES || "15", 10) * 60_000;
}

export function isRotationRandomize(): boolean {
    return (constants.ADS_ROTATION_RANDOMIZE || "true").toLowerCase() === "true";
}

/**
 * Milliseconds until the next publish is allowed (global spacing).
 * Considers both normal published ads and rotation ad publishes.
 * Returns 0 when the window has already elapsed.
 */
export async function getNextPublishMs(): Promise<number> {
    const lastTime = await getLastRotationPublishTime();
    if (!lastTime) return 0;
    const elapsed   = Date.now() - lastTime.getTime();
    const remaining = getRotationIntervalMs() - elapsed;
    return remaining > 0 ? remaining : 0;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let schedulerInterval: NodeJS.Timeout | null = null;

export function startQueueScheduler(): void {
    if (schedulerInterval) return; // idempotent
    schedulerInterval = setInterval(processQueue, 60_000);
    console.log("[AdsQueue] Scheduler started (interval: 60s)");
}

/**
 * Core tick — runs every 60 s.
 *
 * Priority:
 *   1. Queued ads  (if queue enabled and spacing satisfied)
 *   2. Rotation pool  (if rotation enabled, queue empty, spacing satisfied)
 */
export async function processQueue(): Promise<void> {
    // ── Global spacing gate ───────────────────────────────────────────────────
    const waitMs = await getNextPublishMs();
    if (waitMs > 0) return;

    // ── 1. Queue (highest priority) ───────────────────────────────────────────
    if (isQueueEnabled()) {
        const queued = await getQueuedAds();
        if (queued.length > 0) {
            const nextAd = queued[0];
            try {
                const result = await publishDraftViaPublisherBot(nextAd);
                await updateAdDraft(nextAd.id, {
                    status:             "published",
                    publishedAt:        new Date(),
                    publishedMessageId: BigInt(result.messageId),
                    publishedChatId:    result.chatId,
                });
                console.log(
                    `[AdsQueue] Published queued ad #${nextAd.id} ` +
                    `→ chat=${result.chatId} msg=${result.messageId}`
                );
                // Notify creator
                try {
                    await bot.api.sendMessage(
                        Number(nextAd.created_by),
                        `✅ Reklama <b>#${nextAd.id}</b> automatiškai publikuota iš eilės.\n` +
                        `Chat: <code>${result.chatId}</code> · Žinutė: <code>#${result.messageId}</code>`,
                        { parse_mode: "HTML" }
                    );
                } catch { /* DM unavailable — ignore */ }
            } catch (err) {
                console.error(`[AdsQueue] Failed to publish queued ad #${nextAd.id}:`, err);
                // Remains "queued"; retried next tick
            }
            return; // queue ad handled — don't also try rotation this tick
        }
    }

    // ── 2. Rotation pool (fallback) ───────────────────────────────────────────
    if (!isRotationEnabled()) return;

    const rotationAds = await getRotationAds();
    if (rotationAds.length === 0) return;

    // Select ad: random or round-robin (getRotationAds already sorted for round-robin)
    const selected = isRotationRandomize()
        ? rotationAds[Math.floor(Math.random() * rotationAds.length)]
        : rotationAds[0];

    try {
        await publishDraftViaPublisherBot(selected);
        // Rotation ads keep status="rotation"; only update the last-published timestamp
        await updateAdDraft(selected.id, {
            rotationLastPublishedAt: new Date(),
        });
        console.log(
            `[AdsQueue] Published rotation ad #${selected.id} ` +
            `→ target=${selected.target_chat_id}`
        );
    } catch (err) {
        console.error(`[AdsQueue] Failed to publish rotation ad #${selected.id}:`, err);
    }
}
