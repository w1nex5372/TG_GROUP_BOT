import { prisma } from "./index";

export type AdDraftStatus =
    | "draft"
    | "queued"
    | "rejected"
    | "published"
    | "rotation"
    | "removed"
    | "deleted";

export type AdDraftMode = "normal" | "rotation";

export type AdContentType = "text" | "photo" | "video";

export interface AdDraftCreateInput {
    createdBy: bigint;
    sourceChatId?: string;
    sourceMessageId?: bigint;
    contentType: AdContentType;
    text?: string;
    caption?: string;
    mediaFileId?: string;
    buttonText?: string;
    buttonUrl?: string;
    secondButtonText?: string;
    secondButtonUrl?: string;
    targetChatId: string;
    adMode?: AdDraftMode;
}

export interface AdDraftUpdateInput {
    contentType?: AdContentType;
    text?: string | null;
    caption?: string | null;
    mediaFileId?: string | null;
    buttonText?: string | null;
    buttonUrl?: string | null;
    secondButtonText?: string | null;
    secondButtonUrl?: string | null;
    targetChatId?: string;
    status?: AdDraftStatus;
    adMode?: AdDraftMode;
    publishedAt?: Date;
    publishedMessageId?: bigint | null;
    publishedChatId?: string | null;
    queuedAt?: Date | null;
    approvedAt?: Date | null;
    rotationLastPublishedAt?: Date | null;
}

export async function createAdDraft(input: AdDraftCreateInput) {
    const mode = input.adMode ?? "normal";
    return prisma.ad_drafts.create({
        data: {
            created_by:         input.createdBy,
            source_chat_id:     input.sourceChatId     ?? null,
            source_message_id:  input.sourceMessageId  ?? null,
            content_type:       input.contentType,
            text:               input.text             ?? null,
            caption:            input.caption          ?? null,
            media_file_id:      input.mediaFileId      ?? null,
            button_text:        input.buttonText       ?? null,
            button_url:         input.buttonUrl        ?? null,
            second_button_text: input.secondButtonText ?? null,
            second_button_url:  input.secondButtonUrl  ?? null,
            target_chat_id:     input.targetChatId,
            status:             mode === "rotation" ? "rotation" : "draft",
            ad_mode:            mode,
        },
    });
}

export async function getAdDraft(id: number) {
    return prisma.ad_drafts.findUnique({ where: { id } });
}

export async function updateAdDraft(id: number, data: AdDraftUpdateInput) {
    const update: Record<string, unknown> = {};
    if (data.contentType               !== undefined) update.content_type                = data.contentType;
    if (data.text                      !== undefined) update.text                        = data.text;
    if (data.caption                   !== undefined) update.caption                     = data.caption;
    if (data.mediaFileId               !== undefined) update.media_file_id               = data.mediaFileId;
    if (data.buttonText                !== undefined) update.button_text                 = data.buttonText;
    if (data.buttonUrl                 !== undefined) update.button_url                  = data.buttonUrl;
    if (data.secondButtonText          !== undefined) update.second_button_text          = data.secondButtonText;
    if (data.secondButtonUrl           !== undefined) update.second_button_url           = data.secondButtonUrl;
    if (data.targetChatId              !== undefined) update.target_chat_id              = data.targetChatId;
    if (data.status                    !== undefined) update.status                      = data.status;
    if (data.adMode                    !== undefined) update.ad_mode                     = data.adMode;
    if (data.publishedAt               !== undefined) update.published_at                = data.publishedAt;
    if (data.publishedMessageId        !== undefined) update.published_message_id        = data.publishedMessageId;
    if (data.publishedChatId           !== undefined) update.published_chat_id           = data.publishedChatId;
    if (data.queuedAt                  !== undefined) update.queued_at                   = data.queuedAt;
    if (data.approvedAt                !== undefined) update.approved_at                 = data.approvedAt;
    if (data.rotationLastPublishedAt   !== undefined) update.rotation_last_published_at  = data.rotationLastPublishedAt;
    return prisma.ad_drafts.update({ where: { id }, data: update });
}

/** Most recently published normal ad (status=published). */
export async function getLastPublishedAd() {
    return prisma.ad_drafts.findFirst({
        where:   { status: "published" },
        orderBy: { published_at: "desc" },
    });
}

/**
 * Returns the timestamp of the most recent publish across ALL ad types
 * (normal published ads + rotation ads). Used for global spacing enforcement.
 */
export async function getLastPublishTime(): Promise<Date | null> {
    const [normalAd, rotationAd] = await Promise.all([
        prisma.ad_drafts.findFirst({
            where:   { status: "published" },
            orderBy: { published_at: "desc" },
            select:  { published_at: true },
        }),
        prisma.ad_drafts.findFirst({
            where:   { ad_mode: "rotation", rotation_last_published_at: { not: null } },
            orderBy: { rotation_last_published_at: "desc" },
            select:  { rotation_last_published_at: true },
        }),
    ]);

    const t1 = normalAd?.published_at?.getTime() ?? 0;
    const t2 = rotationAd?.rotation_last_published_at?.getTime() ?? 0;
    const maxT = Math.max(t1, t2);
    return maxT > 0 ? new Date(maxT) : null;
}

/**
 * Returns the timestamp of the most recent ROTATION ad publish only.
 * Used by the rotation scheduler — /createad (quick) publishes are ignored
 * so they do not reset the rotation interval.
 */
export async function getLastRotationPublishTime(): Promise<Date | null> {
    const row = await prisma.ad_drafts.findFirst({
        where:   { ad_mode: "rotation", rotation_last_published_at: { not: null } },
        orderBy: { rotation_last_published_at: "desc" },
        select:  { rotation_last_published_at: true },
    });
    return row?.rotation_last_published_at ?? null;
}

/** All queued ads in FIFO order. */
export async function getQueuedAds() {
    return prisma.ad_drafts.findMany({
        where:   { status: "queued" },
        orderBy: { queued_at: "asc" },
    });
}

/** Count of currently queued ads. */
export async function getQueuedAdCount() {
    return prisma.ad_drafts.count({ where: { status: "queued" } });
}

/**
 * All active rotation ads ordered for round-robin:
 * never-published first (null), then least recently published.
 */
export async function getRotationAds() {
    return prisma.ad_drafts.findMany({
        where:   { ad_mode: "rotation", status: "rotation" },
        orderBy: { rotation_last_published_at: { sort: "asc", nulls: "first" } },
    });
}

/** Count of active rotation ads. */
export async function getRotationAdCount() {
    return prisma.ad_drafts.count({ where: { ad_mode: "rotation", status: "rotation" } });
}
