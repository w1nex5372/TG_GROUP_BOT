/**
 * ads_publisher.ts
 *
 * Lightweight publisher service that sends the final approved ad using a
 * DEDICATED second bot (ADS_PUBLISHER_BOT_TOKEN).
 *
 * The main bot (testestoron) handles everything up to and including approval.
 * This service is called only at the moment of publishing so that the message
 * in the target group/channel appears as sent by the publisher bot, not by the
 * main bot.
 *
 * Telegram requirements for the publisher bot:
 *   - Must be added to every target group/channel
 *   - In groups: must have "Send Messages" permission
 *   - In channels: must be an admin with "Post Messages" permission
 */

import { Bot, InlineKeyboard } from "grammy";
import constants from "../config";

// ── Lazy singleton — created on first publish call ────────────────────────────

let publisherBot: Bot | null = null;

function getPublisherBot(): Bot {
    if (!constants.ADS_PUBLISHER_BOT_TOKEN) {
        throw new Error(
            "ADS_PUBLISHER_BOT_TOKEN nenustatytas .env faile. " +
            "Pridėk antrojo (publisher) boto token norint skelbti reklamas per atskirą botą."
        );
    }
    if (!publisherBot) {
        publisherBot = new Bot(constants.ADS_PUBLISHER_BOT_TOKEN);
    }
    return publisherBot;
}

// ── Keyboard builder (duplicated here so service is self-contained) ───────────

function buildAdKeyboard(draft: AdDraftLike): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (draft.button_text && draft.button_url) {
        kb.url(draft.button_text, draft.button_url);
        if (draft.second_button_text && draft.second_button_url) {
            kb.row().url(draft.second_button_text, draft.second_button_url);
        }
    }
    return kb;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface AdDraftLike {
    id:                 number;
    content_type:       string;
    text?:              string | null;
    caption?:           string | null;
    media_file_id?:     string | null;
    button_text?:       string | null;
    button_url?:        string | null;
    second_button_text?: string | null;
    second_button_url?:  string | null;
    target_chat_id:     string;
}

export interface PublishResult {
    messageId: number;
    chatId:    string;
}

// ── Main publish function ─────────────────────────────────────────────────────

export async function publishDraftViaPublisherBot(draft: AdDraftLike): Promise<PublishResult> {
    const publisher = getPublisherBot();
    const adKb      = buildAdKeyboard(draft);
    const hasButton = !!(draft.button_text && draft.button_url);
    const target    = draft.target_chat_id;

    let sentMsg: { message_id: number };

    if (draft.content_type === "text" && draft.text) {
        sentMsg = await publisher.api.sendMessage(
            target,
            draft.text,
            hasButton ? { reply_markup: adKb } : {}
        );
    } else if (draft.content_type === "photo" && draft.media_file_id) {
        sentMsg = await publisher.api.sendPhoto(target, draft.media_file_id, {
            caption: draft.caption ?? undefined,
            ...(hasButton ? { reply_markup: adKb } : {}),
        });
    } else if (draft.content_type === "video" && draft.media_file_id) {
        sentMsg = await publisher.api.sendVideo(target, draft.media_file_id, {
            caption: draft.caption ?? undefined,
            ...(hasButton ? { reply_markup: adKb } : {}),
        });
    } else {
        throw new Error(`Nepalaikomas reklamos tipas: ${draft.content_type}`);
    }

    console.log(
        `[AdsPublisher] draft=${draft.id} type=${draft.content_type} ` +
        `target=${target} msgId=${sentMsg.message_id}`
    );

    return { messageId: sentMsg.message_id, chatId: target };
}

// ── Delete published message ───────────────────────────────────────────────────

/**
 * Deletes a previously published ad message from the target chat.
 * Uses the publisher bot (same credentials) to perform the deletion.
 */
export async function deletePublishedAd(chatId: string, messageId: number): Promise<void> {
    const publisher = getPublisherBot();
    await publisher.api.deleteMessage(chatId, messageId);
    console.log(`[AdsPublisher] deleted message ${messageId} from chat ${chatId}`);
}
