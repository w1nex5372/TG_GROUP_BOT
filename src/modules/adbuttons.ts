import { Composer, InlineKeyboard } from "grammy";
import constants from "../config";
import { buildClientsKeyboard } from "../clients_list";

const composer = new Composer();

type PendingCopy = {
    sourceChatId: number;
    sourceMessageId: number;
};

const pendingByUser = new Map<number, PendingCopy>();

function isAllowedUser(userId: number): boolean {
    const ownerId = Number(constants.OWNER_ID);
    const superusers = constants.SUPERUSERS
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isFinite(id));

    return userId === ownerId || superusers.includes(userId);
}

function adTargetChatId(): number {
    return Number(constants.AD_TARGET_CHAT_ID || constants.ADS_TARGET_CHAT_ID);
}

function buildPresetMenu(): InlineKeyboard {
    return new InlineKeyboard()
        .text("✅ Patvirtinti nariai", "adbuttons:preset:1")
        .row()
        .text("📩 Susisiekti", "adbuttons:preset:2")
        .row()
        .text("🌐 Nuoroda", "adbuttons:preset:3")
        .row()
        .text("Cancel", "adbuttons:cancel");
}

function buildPresetKeyboard(preset: string): InlineKeyboard | null {
    if (preset === "1") {
        return buildClientsKeyboard();
    }

    if (preset === "2") {
        const url = constants.ADS_LINK_URL || "https://t.me/";
        return new InlineKeyboard().url("Atidaryti chatą", url);
    }

    if (preset === "3") {
        if (!constants.ADS_LINK_URL) {
            return null;
        }
        return new InlineKeyboard().url("Eiti", constants.ADS_LINK_URL);
    }

    return null;
}

composer.command("adbuttons", async (ctx: any) => {
    if (!isAllowedUser(ctx.from?.id)) {
        await ctx.reply("❌ Only OWNER_ID and SUPERUSERS can use /adbuttons.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }

    const replied = ctx.message?.reply_to_message;
    if (!replied) {
        await ctx.reply("ℹ️ Reply to a message and then send /adbuttons.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }

    const sourceChatId = ctx.chat?.id;
    const sourceMessageId = replied.message_id;
    const targetChatId = adTargetChatId();

    if (!sourceChatId || !sourceMessageId) {
        await ctx.reply("❌ Could not read replied message context.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }

    if (!targetChatId) {
        await ctx.reply("❌ Configure ADS_TARGET_CHAT_ID or AD_TARGET_CHAT_ID first.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }

    pendingByUser.set(ctx.from.id, { sourceChatId, sourceMessageId });

    await ctx.reply("Pasirinkite mygtukų stilių skelbimui:", {
        reply_markup: buildPresetMenu(),
        reply_parameters: { message_id: ctx.message.message_id },
    });
});

composer.callbackQuery(/^adbuttons:(preset:(1|2|3)|cancel)$/, async (ctx: any) => {
    if (!isAllowedUser(ctx.from?.id)) {
        await ctx.answerCallbackQuery({ text: "❌ Not allowed." });
        return;
    }

    const action = ctx.match[1] as string;
    if (action === "cancel") {
        pendingByUser.delete(ctx.from.id);
        await ctx.answerCallbackQuery({ text: "Cancelled." });
        await ctx.editMessageText("❌ Atšaukta.");
        return;
    }

    const preset = ctx.match[2] as string;
    const pending = pendingByUser.get(ctx.from.id);
    const targetChatId = adTargetChatId();

    if (!pending) {
        await ctx.answerCallbackQuery({ text: "Session expired. Run /adbuttons again." });
        return;
    }

    if (!targetChatId) {
        await ctx.answerCallbackQuery({ text: "Target chat is not configured." });
        await ctx.editMessageText("❌ Configure ADS_TARGET_CHAT_ID or AD_TARGET_CHAT_ID.");
        return;
    }

    const keyboard = buildPresetKeyboard(preset);
    if (!keyboard) {
        await ctx.answerCallbackQuery({ text: "Preset requires ADS_LINK_URL." });
        await ctx.reply("❌ ADS_LINK_URL is required for this preset.");
        return;
    }

    try {
        await ctx.api.copyMessage(targetChatId, pending.sourceChatId, pending.sourceMessageId, {
            reply_markup: keyboard,
        });
        pendingByUser.delete(ctx.from.id);
        await ctx.answerCallbackQuery({ text: "Posted." });
        await ctx.editMessageText("✅ Skelbimas perkeltas su mygtukais.");
    } catch (err: any) {
        await ctx.answerCallbackQuery({ text: "Failed to repost." });
        await ctx.reply(`❌ Failed to repost ad: ${err?.message ?? err}`);
    }
});

export default composer;
