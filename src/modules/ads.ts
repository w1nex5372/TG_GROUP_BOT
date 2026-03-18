import { bot } from "../bot";
import { Composer, InlineKeyboard } from "grammy";
import constants from "../config";
import {
    createAdDraft,
    getAdDraft,
    updateAdDraft,
    getLastRotationPublishTime,
    getQueuedAds,
    getRotationAds,
    getRotationAdCount,
    AdContentType,
} from "../database/ads_sql";
import { publishDraftViaPublisherBot, deletePublishedAd } from "../services/ads_publisher";
import {
    getMinSpacingMs,
    getNextPublishMs,
    isRotationEnabled,
    getRotationIntervalMs,
    isRotationRandomize,
} from "../services/ads_queue";

const composer = new Composer();

// ── Permission check ──────────────────────────────────────────────────────────

function isSuperuser(userId: number): boolean {
    const ownerId = String(constants.OWNER_ID).trim();
    const superusers = String(constants.SUPERUSERS)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return String(userId) === ownerId || superusers.includes(String(userId));
}

// ── In-memory pending states ──────────────────────────────────────────────────

interface PendingCreateState {
    stage: "waiting_button_text" | "waiting_button_url";
    contentType: AdContentType;
    text?: string;
    caption?: string;
    mediaFileId?: string;
    sourceChatId?: string;
    sourceMessageId?: bigint;
    targetChatId: string;
    buttonText?: string;
    adminChatId: number;
}

interface PendingEditState {
    stage: "waiting_button_text" | "waiting_button_url";
    draftId: number;
    buttonText?: string;
    previewChatId: number;
    previewMsgId: number;
}

// Rotation creation shares the same shape as normal create
interface PendingRotationState {
    stage: "waiting_button_text" | "waiting_button_url";
    contentType: AdContentType;
    text?: string;
    caption?: string;
    mediaFileId?: string;
    sourceChatId?: string;
    sourceMessageId?: bigint;
    targetChatId: string;
    buttonText?: string;
    adminChatId: number;
}

const pendingCreate   = new Map<number, PendingCreateState>();
const pendingEdit     = new Map<number, PendingEditState>();
const pendingRotation = new Map<number, PendingRotationState>();

// ── Target chat helpers ───────────────────────────────────────────────────────

interface TargetChat { label: string; chatId: string; }

function getAvailableTargets(): TargetChat[] {
    const targets: TargetChat[] = [];
    if (constants.ADS_TARGET_CHAT_ID) {
        targets.push({
            label:  constants.ADS_TARGET_CHAT_LABEL  || "Pagrindinė grupė",
            chatId: constants.ADS_TARGET_CHAT_ID,
        });
    }
    if (constants.ADS_TARGET_CHAT_ID_2) {
        targets.push({
            label:  constants.ADS_TARGET_CHAT_LABEL_2 || "Reklamos kanalas",
            chatId: constants.ADS_TARGET_CHAT_ID_2,
        });
    }
    return targets;
}

function getDefaultTargetChatId(): string {
    return constants.ADS_TARGET_CHAT_ID || "";
}

function getTargetLabel(chatId: string): string {
    return getAvailableTargets().find((t) => t.chatId === chatId)?.label ?? chatId;
}

// ── URL validator ─────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
}

// ── Parse inline button args ──────────────────────────────────────────────────
// Format: "BTN_TEXT | https://url ; BTN2_TEXT | https://url2"

interface ParsedButtonArgs {
    buttonText: string;
    buttonUrl: string;
    secondButtonText?: string;
    secondButtonUrl?: string;
}

function parseButtonArgs(args: string): ParsedButtonArgs | null {
    if (!args.trim()) return null;
    const parts = args.split(";").map((p) => p.trim());
    let result: ParsedButtonArgs | null = null;

    for (let i = 0; i < parts.length && i < 2; i++) {
        const pipeIdx = parts[i].lastIndexOf("|");
        if (pipeIdx === -1) continue;
        const label = parts[i].slice(0, pipeIdx).trim();
        const url   = parts[i].slice(pipeIdx + 1).trim();
        if (!label || !url) continue;
        if (i === 0) {
            result = { buttonText: label, buttonUrl: url };
        } else if (result) {
            result.secondButtonText = label;
            result.secondButtonUrl  = url;
        }
    }
    return result;
}

// ── Extract content from a replied message ────────────────────────────────────

function extractContentFromReply(replied: any): {
    contentType: AdContentType;
    text?: string;
    caption?: string;
    mediaFileId?: string;
} | null {
    if (replied.text) {
        return { contentType: "text", text: replied.text };
    } else if (replied.photo) {
        return {
            contentType: "photo",
            mediaFileId: replied.photo[replied.photo.length - 1].file_id,
            caption:     replied.caption ?? undefined,
        };
    } else if (replied.video) {
        return {
            contentType: "video",
            mediaFileId: replied.video.file_id,
            caption:     replied.caption ?? undefined,
        };
    }
    return null;
}

// ── Build published ad inline keyboard ───────────────────────────────────────

function buildAdKeyboard(draft: any): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (draft.button_text && draft.button_url) {
        kb.url(draft.button_text, draft.button_url);
        if (draft.second_button_text && draft.second_button_url) {
            kb.row().url(draft.second_button_text, draft.second_button_url);
        }
    }
    return kb;
}

// ── Build admin preview inline keyboard ──────────────────────────────────────

function buildAdminPreviewKeyboard(draftId: number): InlineKeyboard {
    return new InlineKeyboard()
        .text("✅ Patvirtinti",   `ad:approve:${draftId}`)
        .text("❌ Atmesti",       `ad:reject:${draftId}`).row()
        .text("🔗 Keisti mygtuką", `ad:edit_button:${draftId}`)
        .text("📍 Keisti target",  `ad:change_target:${draftId}`);
}

// ── Build preview header text ─────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    text:  "Tekstas",
    photo: "Foto + aprašas",
    video: "Video + aprašas",
};

function buildPreviewHeaderText(draft: any): string {
    return (
        `📣 <b>Reklamos peržiūra</b>\n\n` +
        `Tipas: ${TYPE_LABELS[draft.content_type] ?? draft.content_type}\n` +
        `Target: ${getTargetLabel(draft.target_chat_id)}\n` +
        `Mygtukas: ${draft.button_text ?? "nėra"}\n` +
        `URL: ${draft.button_url ?? "nėra"}\n` +
        (draft.second_button_text ? `2-as mygtukas: ${draft.second_button_text}\n` : "") +
        (draft.second_button_url  ? `2-as URL: ${draft.second_button_url}\n`       : "") +
        `\nŽemiau rodoma reklamos peržiūra.`
    );
}

// ── Send preview to admin (header + content) ──────────────────────────────────

async function sendPreview(ctx: any, draft: any): Promise<void> {
    const headerText = buildPreviewHeaderText(draft);
    const adminKb    = buildAdminPreviewKeyboard(draft.id);
    const adKb       = buildAdKeyboard(draft);
    const hasButton  = !!(draft.button_text && draft.button_url);

    await ctx.reply(headerText, { parse_mode: "HTML", reply_markup: adminKb });

    if (draft.content_type === "text" && draft.text) {
        await ctx.reply(draft.text, hasButton ? { reply_markup: adKb } : {});
    } else if (draft.content_type === "photo" && draft.media_file_id) {
        await ctx.api.sendPhoto(ctx.chat.id, draft.media_file_id, {
            caption: draft.caption ?? undefined,
            ...(hasButton ? { reply_markup: adKb } : {}),
        });
    } else if (draft.content_type === "video" && draft.media_file_id) {
        await ctx.api.sendVideo(ctx.chat.id, draft.media_file_id, {
            caption: draft.caption ?? undefined,
            ...(hasButton ? { reply_markup: adKb } : {}),
        });
    }
}

// ── /createad command ─────────────────────────────────────────────────────────

bot.command("createad", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const replied = ctx.message?.reply_to_message;
    if (!replied) {
        await ctx.reply(
            "📣 <b>Naudojimas:</b>\n\n" +
            "Atsakyk į reklamos žinutę ir rašyk:\n" +
            "<code>/createad KANALAS | https://t.me/xxx</code>\n\n" +
            "Arba be mygtuko:\n" +
            "<code>/createad</code>\n\n" +
            "Du mygtukai:\n" +
            "<code>/createad BTN1 | https://url1.com ; BTN2 | https://url2.com</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const content = extractContentFromReply(replied);
    if (!content) {
        await ctx.reply("❌ Nepalaikomas reklamos tipas. Naudok tekstą arba nuotrauką su aprašu.");
        return;
    }

    const targetChatId = getDefaultTargetChatId();
    if (!targetChatId) {
        await ctx.reply("❌ ADS_TARGET_CHAT_ID nenustatytas .env faile.");
        return;
    }

    const args       = (ctx.match ?? "").trim();
    const buttonInfo = parseButtonArgs(args);

    if (buttonInfo) {
        if (!isValidUrl(buttonInfo.buttonUrl)) {
            await ctx.reply(`❌ Neteisingas URL: <code>${buttonInfo.buttonUrl}</code>`, { parse_mode: "HTML" });
            return;
        }
        if (buttonInfo.secondButtonUrl && !isValidUrl(buttonInfo.secondButtonUrl)) {
            await ctx.reply(`❌ Neteisingas 2-as URL: <code>${buttonInfo.secondButtonUrl}</code>`, { parse_mode: "HTML" });
            return;
        }

        const draft = await createAdDraft({
            createdBy:        BigInt(fromId),
            sourceChatId:     String(ctx.chat.id),
            sourceMessageId:  BigInt(replied.message_id),
            contentType:      content.contentType,
            text:             content.text,
            caption:          content.caption,
            mediaFileId:      content.mediaFileId,
            buttonText:       buttonInfo.buttonText,
            buttonUrl:        buttonInfo.buttonUrl,
            secondButtonText: buttonInfo.secondButtonText,
            secondButtonUrl:  buttonInfo.secondButtonUrl,
            targetChatId,
        });

        console.log(`[Ads] draft created id=${draft.id} by=${fromId} type=${content.contentType}`);
        await sendPreview(ctx, draft);
    } else {
        // No args: create ad without button immediately
        const draft = await createAdDraft({
            createdBy:       BigInt(fromId),
            sourceChatId:    String(ctx.chat.id),
            sourceMessageId: BigInt(replied.message_id),
            contentType:     content.contentType,
            text:            content.text,
            caption:         content.caption,
            mediaFileId:     content.mediaFileId,
            targetChatId,
        });

        console.log(`[Ads] draft created id=${draft.id} by=${fromId} type=${content.contentType} (no button)`);
        await sendPreview(ctx, draft);
    }
});

// ── /addrotation command ──────────────────────────────────────────────────────

bot.command("addrotation", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const replied = ctx.message?.reply_to_message;
    if (!replied) {
        await ctx.reply(
            "🔄 <b>Naudojimas:</b>\n\n" +
            "Atsakyk į reklamos žinutę ir rašyk:\n" +
            "<code>/addrotation KANALAS | https://t.me/xxx</code>\n\n" +
            "Arba be mygtuko:\n" +
            "<code>/addrotation</code>\n\n" +
            "Reklama bus pridėta į nuolatinį rotacijos baseiną.",
            { parse_mode: "HTML" }
        );
        return;
    }

    const content = extractContentFromReply(replied);
    if (!content) {
        await ctx.reply("❌ Nepalaikomas tipas. Naudok tekstą arba nuotrauką su aprašu.");
        return;
    }

    const targetChatId = getDefaultTargetChatId();
    if (!targetChatId) {
        await ctx.reply("❌ ADS_TARGET_CHAT_ID nenustatytas .env faile.");
        return;
    }

    const args       = (ctx.match ?? "").trim();
    const buttonInfo = parseButtonArgs(args);

    if (buttonInfo) {
        if (!isValidUrl(buttonInfo.buttonUrl)) {
            await ctx.reply(`❌ Neteisingas URL: <code>${buttonInfo.buttonUrl}</code>`, { parse_mode: "HTML" });
            return;
        }
        if (buttonInfo.secondButtonUrl && !isValidUrl(buttonInfo.secondButtonUrl)) {
            await ctx.reply(`❌ Neteisingas 2-as URL: <code>${buttonInfo.secondButtonUrl}</code>`, { parse_mode: "HTML" });
            return;
        }

        const ad = await createAdDraft({
            createdBy:        BigInt(fromId),
            sourceChatId:     String(ctx.chat.id),
            sourceMessageId:  BigInt(replied.message_id),
            contentType:      content.contentType,
            text:             content.text,
            caption:          content.caption,
            mediaFileId:      content.mediaFileId,
            buttonText:       buttonInfo.buttonText,
            buttonUrl:        buttonInfo.buttonUrl,
            secondButtonText: buttonInfo.secondButtonText,
            secondButtonUrl:  buttonInfo.secondButtonUrl,
            targetChatId,
            adMode:           "rotation",
        });

        console.log(`[Ads] rotation ad created id=${ad.id} by=${fromId}`);
        await ctx.reply(
            `✅ Reklama <b>#${ad.id}</b> pridėta į rotacijos baseiną.\n` +
            `Target: ${getTargetLabel(targetChatId)}`,
            { parse_mode: "HTML" }
        );
    } else {
        // No args: create rotation ad without button immediately
        const ad = await createAdDraft({
            createdBy:       BigInt(fromId),
            sourceChatId:    String(ctx.chat.id),
            sourceMessageId: BigInt(replied.message_id),
            contentType:     content.contentType,
            text:            content.text,
            caption:         content.caption,
            mediaFileId:     content.mediaFileId,
            targetChatId,
            adMode:          "rotation",
        });

        console.log(`[Ads] rotation ad created id=${ad.id} by=${fromId} (no button)`);
        await ctx.reply(
            `✅ Reklama <b>#${ad.id}</b> pridėta į rotacijos baseiną.\n` +
            `Target: ${getTargetLabel(targetChatId)}\n` +
            `Mygtukas: nėra`,
            { parse_mode: "HTML" }
        );
    }
});

// ── Text message handler — interactive button collection ──────────────────────

composer.on("message:text", async (ctx: any, next: () => Promise<void>) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return next();

    const input = ctx.message.text.trim();
    if (input.startsWith("/")) return next();

    // ── Normal create flow ────────────────────────────────────────────────────
    const createState = pendingCreate.get(fromId);
    if (createState && ctx.chat?.id === createState.adminChatId) {
        if (createState.stage === "waiting_button_text") {
            createState.buttonText = input;
            createState.stage      = "waiting_button_url";
            pendingCreate.set(fromId, createState);
            await ctx.reply(
                "🔗 <b>Mygtuko URL</b>\n\nĮrašyk mygtuko URL (pvz. <code>https://t.me/xxx</code>):",
                { parse_mode: "HTML" }
            );
            return;
        }
        if (createState.stage === "waiting_button_url") {
            if (!isValidUrl(input)) {
                await ctx.reply(
                    "❌ Neteisingas URL. Turi prasidėti su <code>http://</code> arba <code>https://</code>\n\nĮveskite URL dar kartą:",
                    { parse_mode: "HTML" }
                );
                return;
            }
            pendingCreate.delete(fromId);

            const draft = await createAdDraft({
                createdBy:       BigInt(fromId),
                sourceChatId:    createState.sourceChatId,
                sourceMessageId: createState.sourceMessageId,
                contentType:     createState.contentType,
                text:            createState.text,
                caption:         createState.caption,
                mediaFileId:     createState.mediaFileId,
                buttonText:      createState.buttonText!,
                buttonUrl:       input,
                targetChatId:    createState.targetChatId,
            });

            console.log(`[Ads] draft created id=${draft.id} by=${fromId}`);
            await sendPreview(ctx, draft);
            return;
        }
    }

    // ── Rotation create flow ──────────────────────────────────────────────────
    const rotState = pendingRotation.get(fromId);
    if (rotState && ctx.chat?.id === rotState.adminChatId) {
        if (rotState.stage === "waiting_button_text") {
            rotState.buttonText = input;
            rotState.stage      = "waiting_button_url";
            pendingRotation.set(fromId, rotState);
            await ctx.reply(
                "🔗 <b>Mygtuko URL</b>\n\nĮrašyk mygtuko URL (pvz. <code>https://t.me/xxx</code>):",
                { parse_mode: "HTML" }
            );
            return;
        }
        if (rotState.stage === "waiting_button_url") {
            if (!isValidUrl(input)) {
                await ctx.reply(
                    "❌ Neteisingas URL. Turi prasidėti su <code>http://</code> arba <code>https://</code>\n\nĮveskite URL dar kartą:",
                    { parse_mode: "HTML" }
                );
                return;
            }
            pendingRotation.delete(fromId);

            const ad = await createAdDraft({
                createdBy:       BigInt(fromId),
                sourceChatId:    rotState.sourceChatId,
                sourceMessageId: rotState.sourceMessageId,
                contentType:     rotState.contentType,
                text:            rotState.text,
                caption:         rotState.caption,
                mediaFileId:     rotState.mediaFileId,
                buttonText:      rotState.buttonText!,
                buttonUrl:       input,
                targetChatId:    rotState.targetChatId,
                adMode:          "rotation",
            });

            console.log(`[Ads] rotation ad created id=${ad.id} by=${fromId}`);
            await ctx.reply(
                `✅ Reklama <b>#${ad.id}</b> pridėta į rotacijos baseiną.\n` +
                `Target: ${getTargetLabel(rotState.targetChatId)}`,
                { parse_mode: "HTML" }
            );
            return;
        }
    }

    // ── Edit flow ─────────────────────────────────────────────────────────────
    const editState = pendingEdit.get(fromId);
    if (editState && ctx.chat?.id === editState.previewChatId) {
        if (editState.stage === "waiting_button_text") {
            editState.buttonText = input;
            editState.stage      = "waiting_button_url";
            pendingEdit.set(fromId, editState);
            await ctx.reply(
                "🔗 <b>Naujas mygtuko URL</b>\n\nĮrašyk URL (pvz. <code>https://t.me/xxx</code>):",
                { parse_mode: "HTML" }
            );
            return;
        }
        if (editState.stage === "waiting_button_url") {
            if (!isValidUrl(input)) {
                await ctx.reply(
                    "❌ Neteisingas URL. Turi prasidėti su <code>http://</code> arba <code>https://</code>\n\nĮveskite URL dar kartą:",
                    { parse_mode: "HTML" }
                );
                return;
            }
            pendingEdit.delete(fromId);

            await updateAdDraft(editState.draftId, {
                buttonText: editState.buttonText!,
                buttonUrl:  input,
            });

            const updated = await getAdDraft(editState.draftId);
            if (!updated) { await ctx.reply("❌ Draftas nerastas."); return; }

            const headerText = buildPreviewHeaderText(updated);
            const adminKb    = buildAdminPreviewKeyboard(updated.id);

            try {
                await ctx.api.editMessageText(
                    editState.previewChatId,
                    editState.previewMsgId,
                    headerText,
                    { parse_mode: "HTML", reply_markup: adminKb }
                );
                await ctx.reply("✅ Mygtukas atnaujintas.");
            } catch {
                await ctx.reply("✅ Mygtukas atnaujintas.");
                await sendPreview(ctx, updated);
            }
            return;
        }
    }

    return next();
});

// ── Approve callback ──────────────────────────────────────────────────────────
// Quick ads (/createad) publish IMMEDIATELY — no spacing, no queue.

bot.callbackQuery(/^ad:approve:(\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery({ text: "❌ Tik adminai gali patvirtinti." });
        return;
    }

    const draftId = parseInt(ctx.match[1], 10);
    const draft   = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }
    if (draft.status === "published") {
        await ctx.answerCallbackQuery({ text: "ℹ️ Jau išsiųsta." });
        return;
    }
    if (draft.status === "rejected") {
        await ctx.answerCallbackQuery({ text: "❌ Draftas buvo atmestas." });
        return;
    }

    // ── Publish immediately — no wait, no queue ───────────────────────────────
    try {
        const result = await publishDraftViaPublisherBot(draft);
        await updateAdDraft(draft.id, {
            status:             "published",
            publishedAt:        new Date(),
            publishedMessageId: BigInt(result.messageId),
            publishedChatId:    result.chatId,
        });

        await ctx.answerCallbackQuery({ text: "✅ Reklama išsiųsta!" });

        const updatedText =
            buildPreviewHeaderText(draft) +
            `\n\n✅ <b>Išsiųsta per publisher botą</b>\n` +
            `Chat: <code>${result.chatId}</code> · Žinutė: <code>#${result.messageId}</code>`;
        await ctx.editMessageText(updatedText, { parse_mode: "HTML" }).catch(() => {});
    } catch (err: any) {
        console.error("[Ads] publish error:", err);
        const errMsg = err?.description ?? err?.message ?? String(err);
        await ctx.answerCallbackQuery({ text: "❌ Nepavyko išsiųsti reklamos per publisher botą." });
        await ctx.reply(
            `❌ <b>Nepavyko išsiųsti reklamos per publisher botą.</b>\n\n` +
            `Klaida: <code>${errMsg}</code>\n\n` +
            `Patikrink:\n` +
            `• <code>ADS_PUBLISHER_BOT_TOKEN</code> .env faile\n` +
            `• Publisher botas turi būti pridėtas į target chatą\n` +
            `• Grupėje — Send Messages teisė\n` +
            `• Kanale — Post Messages admin teisė`,
            { parse_mode: "HTML" }
        ).catch(() => {});
    }
});

// ── Reject callback ───────────────────────────────────────────────────────────

bot.callbackQuery(/^ad:reject:(\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery({ text: "❌ Tik adminai gali atmesti." });
        return;
    }

    const draftId = parseInt(ctx.match[1], 10);
    const draft   = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }
    if (draft.status !== "draft") {
        await ctx.answerCallbackQuery({ text: `ℹ️ Statusas: ${draft.status}` });
        return;
    }

    await updateAdDraft(draftId, { status: "rejected" });
    await ctx.answerCallbackQuery({ text: "❌ Reklama atmesta." });

    const updatedText = buildPreviewHeaderText(draft) + "\n\n❌ <b>Atmesta.</b>";
    await ctx.editMessageText(updatedText, { parse_mode: "HTML" }).catch(() => {});
});

// ── Edit button callback ──────────────────────────────────────────────────────

bot.callbackQuery(/^ad:edit_button:(\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery({ text: "❌ Tik adminai gali redaguoti." });
        return;
    }

    const draftId = parseInt(ctx.match[1], 10);
    const draft   = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }
    if (draft.status === "published" || draft.status === "rejected") {
        await ctx.answerCallbackQuery({ text: `ℹ️ Negalima redaguoti: statusas ${draft.status}` });
        return;
    }

    await ctx.answerCallbackQuery();

    pendingEdit.set(fromId, {
        stage:         "waiting_button_text",
        draftId,
        previewChatId: ctx.chat?.id ?? ctx.from.id,
        previewMsgId:  ctx.callbackQuery.message.message_id,
    });

    await ctx.reply(
        "🔗 <b>Naujas mygtuko tekstas</b>\n\nĮrašyk naują mygtuko tekstą:",
        { parse_mode: "HTML" }
    );
});

// ── Change target callback ────────────────────────────────────────────────────

bot.callbackQuery(/^ad:change_target:(\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery({ text: "❌ Tik adminai gali keisti target." });
        return;
    }

    const draftId = parseInt(ctx.match[1], 10);
    const draft   = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }
    if (draft.status === "published" || draft.status === "rejected") {
        await ctx.answerCallbackQuery({ text: `ℹ️ Negalima keisti: statusas ${draft.status}` });
        return;
    }

    const targets = getAvailableTargets();
    if (targets.length === 0) {
        await ctx.answerCallbackQuery({ text: "❌ Nėra sukonfigūruotų targetų .env faile." });
        return;
    }
    if (targets.length === 1) {
        await ctx.answerCallbackQuery({ text: `ℹ️ Vienintelis target: ${targets[0].label}` });
        return;
    }

    await ctx.answerCallbackQuery();

    const kb = new InlineKeyboard();
    for (const target of targets) {
        const selected = target.chatId === draft.target_chat_id ? "✓ " : "";
        kb.text(`${selected}${target.label}`, `ad:set_target:${draftId}:${target.chatId}`).row();
    }
    kb.text("⬅️ Atgal", `ad:back_preview:${draftId}`);

    await ctx.reply("📍 <b>Pasirink target chatą:</b>", {
        parse_mode: "HTML",
        reply_markup: kb,
    });
});

// ── Set target callback ───────────────────────────────────────────────────────

bot.callbackQuery(/^ad:set_target:(\d+):(-?\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery({ text: "❌ Tik adminai gali keisti target." });
        return;
    }

    const draftId      = parseInt(ctx.match[1], 10);
    const targetChatId = ctx.match[2] as string;

    await updateAdDraft(draftId, { targetChatId });
    const draft = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }

    const label = getTargetLabel(targetChatId);
    await ctx.answerCallbackQuery({ text: `✅ Target: ${label}` });

    const headerText = buildPreviewHeaderText(draft);
    const adminKb    = buildAdminPreviewKeyboard(draftId);

    try {
        await ctx.editMessageText(headerText, { parse_mode: "HTML", reply_markup: adminKb });
    } catch {
        await ctx.reply(headerText, { parse_mode: "HTML", reply_markup: adminKb });
    }
});

// ── Back to preview callback ──────────────────────────────────────────────────

bot.callbackQuery(/^ad:back_preview:(\d+)$/, async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) {
        await ctx.answerCallbackQuery();
        return;
    }

    const draftId = parseInt(ctx.match[1], 10);
    const draft   = await getAdDraft(draftId);

    if (!draft) {
        await ctx.answerCallbackQuery({ text: "❌ Draftas nerastas." });
        return;
    }

    await ctx.answerCallbackQuery();

    const headerText = buildPreviewHeaderText(draft);
    const adminKb    = buildAdminPreviewKeyboard(draftId);

    try {
        await ctx.editMessageText(headerText, { parse_mode: "HTML", reply_markup: adminKb });
    } catch {}
});

// ── /adsstatus command ────────────────────────────────────────────────────────

bot.command("adsstatus", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const rotIntervalMin = Math.round(getRotationIntervalMs() / 60_000);
    const rotEnabled     = isRotationEnabled();
    const rotRandomize   = isRotationRandomize();

    const [rotCount, lastRotation, waitMs] = await Promise.all([
        getRotationAdCount(),
        getLastRotationPublishTime(),
        getNextPublishMs(),
    ]);

    let lastRotText = "niekada";
    if (lastRotation) {
        lastRotText = lastRotation.toLocaleString("lt-LT", {
            timeZone: "Europe/Vilnius",
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    }

    let nextRotText: string;
    if (waitMs <= 0) {
        nextRotText = "dabar";
    } else {
        const nextDate  = new Date(Date.now() + waitMs);
        const formatted = nextDate.toLocaleString("lt-LT", {
            timeZone: "Europe/Vilnius",
            hour: "2-digit", minute: "2-digit",
        });
        nextRotText = `${formatted} (~${Math.ceil(waitMs / 60_000)} min.)`;
    }

    const text =
        `📣 <b>Reklamų statusas</b>\n\n` +
        `<b>Quick ads</b> (/createad): greitasis skelbimas — publikuoja iš karto\n\n` +
        `<b>Rotation:</b> ${rotEnabled ? "įjungta ✅" : "išjungta ❌"}\n` +
        `Rotation reklamos: ${rotCount}\n` +
        (rotEnabled
            ? `Rotation intervalas: ${rotIntervalMin} min · ${rotRandomize ? "atsitiktinė" : "eilės tvarka"}\n` +
              `Paskutinė rotation reklama: ${lastRotText}\n` +
              `Kita rotation reklama: ${nextRotText}`
            : `Paskutinė rotation reklama: ${lastRotText}`
        );

    await ctx.reply(text, { parse_mode: "HTML" });
});

// ── /adqueue command ──────────────────────────────────────────────────────────

bot.command("adqueue", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const queued = await getQueuedAds();
    if (queued.length === 0) {
        await ctx.reply("📭 Eilė tuščia.");
        return;
    }

    const waitMs       = await getNextPublishMs();
    const minSpacingMs = getMinSpacingMs();

    const lines = queued.map((ad, i) => {
        const rawText = ad.text || ad.caption || "(media)";
        const preview = rawText.replace(/\n/g, " ").slice(0, 30);
        const label   = getTargetLabel(ad.target_chat_id);
        const estMs   = waitMs + i * minSpacingMs;
        const estText = estMs <= 0 ? "dabar" : `~${Math.ceil(estMs / 60_000)} min.`;
        return `${i + 1}. <b>#${ad.id}</b> — "${preview}..." — ${label} [${estText}]`;
    });

    await ctx.reply(
        `📋 <b>Reklamų eilė (${queued.length})</b>\n\n` + lines.join("\n"),
        { parse_mode: "HTML" }
    );
});

// ── Rotation ad guard helper ──────────────────────────────────────────────────

async function getRotationAdOrReply(ctx: any, draftId: number): Promise<any | null> {
    const draft = await getAdDraft(draftId);
    if (!draft) {
        await ctx.reply(`❌ Reklama <b>#${draftId}</b> nerasta.`, { parse_mode: "HTML" });
        return null;
    }
    if ((draft as any).ad_mode !== "rotation" || draft.status !== "rotation") {
        await ctx.reply(
            `❌ Reklama <b>#${draftId}</b> nėra rotacijos baseine (statusas: <code>${draft.status}</code>).`,
            { parse_mode: "HTML" }
        );
        return null;
    }
    return draft;
}

// ── /rotationbutton <id> BTN_TEXT | URL ───────────────────────────────────────

bot.command("rotationbutton", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const args     = (ctx.match ?? "").trim();
    const spaceIdx = args.indexOf(" ");
    if (!args || spaceIdx === -1) {
        await ctx.reply(
            "❌ Naudojimas: <code>/rotationbutton &lt;id&gt; TEKSTAS | https://url</code>\n\n" +
            "Du mygtukai:\n" +
            "<code>/rotationbutton &lt;id&gt; BTN1 | https://url1 ; BTN2 | https://url2</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const idStr   = args.slice(0, spaceIdx).trim();
    const btnArgs = args.slice(spaceIdx + 1).trim();
    const draftId = parseInt(idStr, 10);

    if (isNaN(draftId)) {
        await ctx.reply("❌ Neteisingas ID.", { parse_mode: "HTML" });
        return;
    }

    const buttonInfo = parseButtonArgs(btnArgs);
    if (!buttonInfo) {
        await ctx.reply(
            "❌ Neteisingas formatas.\n\nNaudojimas: <code>/rotationbutton &lt;id&gt; TEKSTAS | https://url</code>",
            { parse_mode: "HTML" }
        );
        return;
    }
    if (!isValidUrl(buttonInfo.buttonUrl)) {
        await ctx.reply(`❌ Neteisingas URL: <code>${buttonInfo.buttonUrl}</code>`, { parse_mode: "HTML" });
        return;
    }
    if (buttonInfo.secondButtonUrl && !isValidUrl(buttonInfo.secondButtonUrl)) {
        await ctx.reply(`❌ Neteisingas 2-as URL: <code>${buttonInfo.secondButtonUrl}</code>`, { parse_mode: "HTML" });
        return;
    }

    const draft = await getRotationAdOrReply(ctx, draftId);
    if (!draft) return;

    const hadButton = !!(draft.button_text && draft.button_url);

    await updateAdDraft(draftId, {
        buttonText:       buttonInfo.buttonText,
        buttonUrl:        buttonInfo.buttonUrl,
        secondButtonText: buttonInfo.secondButtonText ?? null,
        secondButtonUrl:  buttonInfo.secondButtonUrl  ?? null,
    });

    await ctx.reply(
        `✅ Reklamos <b>#${draftId}</b> mygtukas ${hadButton ? "pakeistas" : "pridėtas"}.\n` +
        `Mygtukas: <b>${buttonInfo.buttonText}</b>\n` +
        `URL: <code>${buttonInfo.buttonUrl}</code>` +
        (buttonInfo.secondButtonText ? `\n2-as mygtukas: <b>${buttonInfo.secondButtonText}</b>` : ""),
        { parse_mode: "HTML" }
    );
});

// ── /rotationnobutton <id> ────────────────────────────────────────────────────

bot.command("rotationnobutton", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const arg     = (ctx.match ?? "").trim();
    const draftId = parseInt(arg, 10);
    if (!arg || isNaN(draftId)) {
        await ctx.reply(
            "❌ Naudojimas: <code>/rotationnobutton &lt;id&gt;</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const draft = await getRotationAdOrReply(ctx, draftId);
    if (!draft) return;

    if (!draft.button_text && !draft.button_url) {
        await ctx.reply(`ℹ️ Reklama <b>#${draftId}</b> jau neturi mygtuko.`, { parse_mode: "HTML" });
        return;
    }

    await updateAdDraft(draftId, {
        buttonText:       null,
        buttonUrl:        null,
        secondButtonText: null,
        secondButtonUrl:  null,
    });

    await ctx.reply(
        `✅ Reklamos <b>#${draftId}</b> mygtukas pašalintas.\nBūsimi skelbimai bus be mygtuko.`,
        { parse_mode: "HTML" }
    );
});

// ── /rotationedit <id> ────────────────────────────────────────────────────────

bot.command("rotationedit", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const replied = ctx.message?.reply_to_message;
    if (!replied) {
        await ctx.reply(
            "✏️ <b>Naudojimas:</b>\n\n" +
            "Atsakyk į naują žinutę ir rašyk:\n" +
            "<code>/rotationedit &lt;id&gt;</code>\n\n" +
            "Palaikomi tipai: tekstas, foto + aprašas, video + aprašas.",
            { parse_mode: "HTML" }
        );
        return;
    }

    const arg     = (ctx.match ?? "").trim();
    const draftId = parseInt(arg, 10);
    if (!arg || isNaN(draftId)) {
        await ctx.reply(
            "❌ Naudojimas: <code>/rotationedit &lt;id&gt;</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const content = extractContentFromReply(replied);
    if (!content) {
        await ctx.reply("❌ Nepalaikomas tipas. Naudok tekstą arba nuotrauką/video su aprašu.");
        return;
    }

    const draft = await getRotationAdOrReply(ctx, draftId);
    if (!draft) return;

    await updateAdDraft(draftId, {
        contentType: content.contentType,
        text:        content.text        ?? null,
        caption:     content.caption     ?? null,
        mediaFileId: content.mediaFileId ?? null,
    });

    await ctx.reply(
        `✅ Reklamos <b>#${draftId}</b> turinys atnaujintas.\n` +
        `Tipas: ${TYPE_LABELS[content.contentType] ?? content.contentType}\n` +
        `Mygtukas: ${draft.button_text ?? "nėra"}`,
        { parse_mode: "HTML" }
    );
});

// ── /rotationlist command ─────────────────────────────────────────────────────

bot.command("rotationlist", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const ads = await getRotationAds();
    if (ads.length === 0) {
        await ctx.reply("📭 Rotacijos baseinas tuščias.\n\nPridėk reklamą: <code>/addrotation</code> arba <code>/addrotation BTN | https://url</code>", { parse_mode: "HTML" });
        return;
    }

    const lines = ads.map((ad, i) => {
        const rawText = ad.text || ad.caption || "(media)";
        const preview = rawText.replace(/\n/g, " ").slice(0, 35);
        const label   = getTargetLabel(ad.target_chat_id);
        const btnTag  = (ad.button_text && ad.button_url) ? "[btn]" : "[no-btn]";
        const typeTag = TYPE_LABELS[ad.content_type] ?? ad.content_type;
        const lastStr = (ad as any).rotation_last_published_at
            ? new Date((ad as any).rotation_last_published_at).toLocaleString("lt-LT", {
                  timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit",
              })
            : "niekada";
        return `${i + 1}. <b>#${ad.id}</b> ${btnTag} · ${typeTag} — "${preview}..." — ${label} [${lastStr}]`;
    });

    await ctx.reply(
        `🔄 <b>Rotacijos reklamos (${ads.length})</b>\n\n` + lines.join("\n") +
        `\n\n<i>Komandoms: /rotationbutton /rotationnobutton /rotationedit /rotationremove</i>`,
        { parse_mode: "HTML" }
    );
});

// ── /rotationremove <id> command ──────────────────────────────────────────────

bot.command("rotationremove", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const arg     = (ctx.match ?? "").trim();
    const draftId = parseInt(arg, 10);
    if (!arg || isNaN(draftId)) {
        await ctx.reply(
            "❌ Naudojimas: <code>/rotationremove &lt;id&gt;</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const draft = await getAdDraft(draftId);
    if (!draft) {
        await ctx.reply(`❌ Reklama <b>#${draftId}</b> nerasta.`, { parse_mode: "HTML" });
        return;
    }
    if ((draft as any).ad_mode !== "rotation" || draft.status !== "rotation") {
        await ctx.reply(
            `❌ Reklama <b>#${draftId}</b> nėra rotacijos baseine (statusas: <code>${draft.status}</code>).`,
            { parse_mode: "HTML" }
        );
        return;
    }

    await updateAdDraft(draftId, { status: "removed" });
    await ctx.reply(
        `🗑 Reklama <b>#${draftId}</b> pašalinta iš rotacijos baseino.`,
        { parse_mode: "HTML" }
    );
});

// ── /adremove <draft_id> command ──────────────────────────────────────────────

bot.command("adremove", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const arg     = (ctx.match ?? "").trim();
    const draftId = parseInt(arg, 10);
    if (!arg || isNaN(draftId)) {
        await ctx.reply(
            "❌ Naudojimas: <code>/adremove &lt;draft_id&gt;</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const draft = await getAdDraft(draftId);
    if (!draft) {
        await ctx.reply(`❌ Draftas <b>#${draftId}</b> nerastas.`, { parse_mode: "HTML" });
        return;
    }
    if (draft.status !== "queued") {
        await ctx.reply(
            `❌ Reklama <b>#${draftId}</b> nėra eilėje (statusas: <code>${draft.status}</code>).`,
            { parse_mode: "HTML" }
        );
        return;
    }

    await updateAdDraft(draftId, { status: "removed" });
    await ctx.reply(`🗑 Reklama <b>#${draftId}</b> pašalinta iš eilės.`, { parse_mode: "HTML" });
});

// ── /addelete <draft_id> command ──────────────────────────────────────────────

bot.command("addelete", async (ctx: any) => {
    const fromId: number = ctx.from?.id;
    if (!fromId || !isSuperuser(fromId)) return;

    const arg     = (ctx.match ?? "").trim();
    const draftId = parseInt(arg, 10);
    if (!arg || isNaN(draftId)) {
        await ctx.reply(
            "❌ Naudojimas: <code>/addelete &lt;draft_id&gt;</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const draft = await getAdDraft(draftId);
    if (!draft) {
        await ctx.reply(`❌ Draftas <b>#${draftId}</b> nerastas.`, { parse_mode: "HTML" });
        return;
    }
    if (draft.status !== "published") {
        await ctx.reply(
            `❌ Ši reklama dar nebuvo publikuota (statusas: <code>${draft.status}</code>).`,
            { parse_mode: "HTML" }
        );
        return;
    }

    const msgId  = draft.published_message_id ? Number(draft.published_message_id) : null;
    const chatId = (draft as any).published_chat_id as string | null ?? null;

    if (!msgId || !chatId) {
        await ctx.reply("❌ Ši reklama dar nebuvo publikuota (trūksta žinutės metaduomenų).");
        return;
    }

    try {
        await deletePublishedAd(chatId, msgId);
        await updateAdDraft(draftId, { status: "deleted" });
        await ctx.reply(
            `🗑 Publikuota reklama <b>#${draftId}</b> ištrinta.`,
            { parse_mode: "HTML" }
        );
    } catch (err: any) {
        const errMsg = err?.description ?? err?.message ?? String(err);
        await ctx.reply(
            `❌ <b>Nepavyko ištrinti reklamos.</b>\n\nKlaida: <code>${errMsg}</code>`,
            { parse_mode: "HTML" }
        );
    }
});

export default composer;
