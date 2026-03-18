import { bot } from "../bot";
import { Composer, InlineKeyboard } from "grammy";
import constants from "../config";
import { loadClients, buildClientsKeyboard } from "../clients_list";
import { ensureRefCode, getLeaderboard, buildStatsText } from "../database/referrals_sql";
import { getGroupInviteUrl } from "../database/settings_sql";
import { buildMainMenu, buildBackRow, buildInviteKeyboard } from "../ui/buttons";
import { GUIDE_MENU_TEXT, buildRulesText, buildCommandsText, buildLeaderboardMessage } from "../ui/messages";

// Re-export so referrals.ts can continue to import from this module unchanged.
export { buildMainMenu, GUIDE_MENU_TEXT };

const composer = new Composer();

// ── A) Group welcome on new member join ──────────────────────────────────────

composer.on("message:new_chat_members", async (ctx: any) => {
    const newMembers: any[] = ctx.message.new_chat_members ?? [];
    const humans = newMembers.filter((m: any) => !m.is_bot);
    if (humans.length === 0) return;

    const names = humans.slice(0, 3).map((m: any) => String(m.first_name));
    const extra = humans.length - 3;
    const nameStr = extra > 0 ? `${names.join(", ")} +${extra}` : names.join(", ");

    const text =
        `👋 Sveikas atvykęs, ${nameStr}!\n` +
        `Paspausk mygtuką ir gauk greitą gidą į DM.`;

    const keyboard = new InlineKeyboard().url(
        "📩 Greitas gidas",
        `https://t.me/${constants.BOT_USERNAME}?start=guide`
    );

    try {
        await ctx.reply(text, { reply_markup: keyboard });
        console.log(`[Onboarding] welcome -> group=${ctx.chat.id} count=${humans.length}`);
    } catch (err: any) {
        if (err?.error_code === 403) {
            console.log(`[Onboarding] dm_blocked -> user=${humans[0]?.id} group=${ctx.chat.id}`);
            await ctx.reply(
                `📩 Kad gaučiau gidą, atsidaryk botą ir paspausk Start: @${constants.BOT_USERNAME}`
            ).catch(() => {});
        } else {
            console.error("[Onboarding] welcome send failed:", err);
        }
    }
});

// ── B) DM guide via /start guide deep-link ───────────────────────────────────
// Registered BEFORE start.ts so the "guide" payload is captured here;
// all other payloads fall through via next().

/** Format leaderboard rows into a message string. */
async function buildLeaderboardText(): Promise<string> {
    const rows = await getLeaderboard();
    return buildLeaderboardMessage(rows);
}

const backRow = buildBackRow();

// Throttle: track last guide send time per user (in-memory, resets on restart)
const guideLastSent = new Map<number, number>();
// Track last sent menu message_id per user to prefer editing over sending new
const guideLastMsgId = new Map<number, number>();
const GUIDE_THROTTLE_MS = 10_000;

/** Clear in-memory guide state for a user (used by /resetref). */
export function clearGuideState(userId: number): void {
    guideLastSent.delete(userId);
    guideLastMsgId.delete(userId);
}

composer.chatType("private").command("start", async (ctx: any, next: () => Promise<void>) => {
    // Handle both plain /start and /start guide — both show the guide menu
    if (ctx.match !== "guide" && ctx.match !== "") return next();

    const userId: number = ctx.from?.id;
    const now = Date.now();

    if (now - (guideLastSent.get(userId) ?? 0) < GUIDE_THROTTLE_MS) {
        console.log(`[Onboarding] guide throttled -> user=${userId}`);
        return;
    }
    guideLastSent.set(userId, now);

    const inviteUrl = await getGroupInviteUrl();
    const guideMenu = buildMainMenu(inviteUrl);

    try {
        const existingMsgId = guideLastMsgId.get(userId);
        if (existingMsgId) {
            try {
                await ctx.api.editMessageText(ctx.chat.id, existingMsgId, GUIDE_MENU_TEXT, { reply_markup: guideMenu, parse_mode: "HTML" });
                console.log(`[Onboarding] guide edited -> user=${userId}`);
                return;
            } catch {
                // Message deleted or too old — fall through to send new
            }
        }
        const sent = await ctx.reply(GUIDE_MENU_TEXT, { reply_markup: guideMenu, parse_mode: "HTML" });
        guideLastMsgId.set(userId, sent.message_id);
        console.log(`[Onboarding] guide -> user=${userId}`);
    } catch (err: any) {
        if (err?.error_code === 403) {
            console.log(`[Onboarding] dm_blocked -> user=${userId}`);
        } else {
            console.error("[Onboarding] guide send failed:", err);
        }
    }
});

// ── C) DM command intercepts — registered on bot directly so they fire BEFORE
//      bot.use(modules), which contains the group-oriented handlers ─────────────

bot.chatType("private").command(["postclients", "postclients@" + (process.env.BOT_USERNAME ?? "")], async (ctx: any) => {
    const clients = loadClients();
    if (clients.length === 0) {
        await ctx.reply("✅ Patvirtinti nariai\n\nSąrašas šiuo metu tuščias.");
        return;
    }
    const keyboard = buildClientsKeyboard(clients);
    await ctx.reply(
        "✅ Patvirtinti nariai\nPaspausk mygtuką ir atsidarysi chatą:",
        { reply_markup: keyboard }
    );
    console.log(`[DM] /postclients -> user=${ctx.from?.id}`);
});

bot.chatType("private").command(["rules", "rule"], async (ctx: any) => {
    await ctx.reply(buildRulesText(), { reply_markup: backRow, parse_mode: "HTML" });
    console.log(`[DM] /rules -> user=${ctx.from?.id}`);
});

// ── D) Guide callbacks — registered on bot directly to avoid middleware shadowing ──

bot.callbackQuery(/^(guide:clients|guide:rules|guide:commands|guide:menu|guide:invite|guide:leaderboard|guide:mystats)$/, async (ctx: any) => {
    const data: string = ctx.callbackQuery.data;
    const userId: number = ctx.from?.id;
    console.log(`[GuideMenu] click ${data} user=${userId}`);

    // Guard: guide menu is only valid in private chat
    if (ctx.chat?.type !== "private") {
        await ctx.answerCallbackQuery({ text: "Šis meniu veikia tik privačiame chate." });
        return;
    }

    await ctx.answerCallbackQuery();

    if (data === "guide:clients") {
        const clients = loadClients();
        if (clients.length === 0) {
            await ctx.editMessageText(
                "✅ <b>Patvirtinti nariai</b>\n\nSąrašas šiuo metu tuščias.\n\n📌 Greita komanda:\n<code>/postclients</code>",
                { reply_markup: backRow, parse_mode: "HTML" }
            );
            return;
        }
        // Build keyboard from shared helper — does NOT post to any chat
        const keyboard = buildClientsKeyboard(clients);
        keyboard.row().text("⬅️ Atgal", "guide:menu");
        await ctx.editMessageText(
            "✅ <b>Patvirtinti nariai</b>\n\nPaspausk mygtuką ir atsidarysi chatą:\n\n📌 Greita komanda:\n<code>/postclients</code>",
            { reply_markup: keyboard, parse_mode: "HTML" }
        );
    } else if (data === "guide:rules") {
        await ctx.editMessageText(buildRulesText(), { reply_markup: backRow, parse_mode: "HTML" });
    } else if (data === "guide:commands") {
        await ctx.editMessageText(buildCommandsText(), { reply_markup: backRow, parse_mode: "HTML" });
    } else if (data === "guide:leaderboard") {
        const text = await buildLeaderboardText();
        await ctx.editMessageText(text, { reply_markup: backRow, parse_mode: "HTML" });
    } else if (data === "guide:mystats") {
        const text = await buildStatsText(BigInt(userId));
        await ctx.editMessageText(text, { reply_markup: backRow });
    } else if (data === "guide:menu") {
        const inviteUrl = await getGroupInviteUrl();
        await ctx.editMessageText(GUIDE_MENU_TEXT, { reply_markup: buildMainMenu(inviteUrl), parse_mode: "HTML" });
    } else if (data === "guide:invite") {
        try {
            const inviteUrl = await getGroupInviteUrl();
            const refCode = await ensureRefCode(BigInt(userId));
            const refLink = `https://t.me/${constants.BOT_USERNAME}?start=ref_${refCode}`;
            const shareUrl =
                `https://t.me/share/url?url=${encodeURIComponent(refLink)}` +
                `&text=${encodeURIComponent("Prisijunk prie grupės per mano nuorodą!")}`;

            const keyboard = buildInviteKeyboard(shareUrl, inviteUrl);

            await ctx.editMessageText(
                "📣 <b>Pakviesk draugą ir rink taškus!</b>\n\n" +
                "Draugas paspaus nuorodą → botas užregistruos kvietimą → draugas prisijungs prie grupės.\n\n" +
                `Tavo nuoroda (paspausk ir nukopijuok):\n<code>${refLink}</code>\n\n` +
                "📌 Greitos komandos:\n<code>/postclients</code> · <code>/rules</code> · <code>/help</code>",
                { reply_markup: keyboard, parse_mode: "HTML" },
            );
        } catch (err) {
            console.error("[GuideMenu] guide:invite error:", err);
            await ctx.answerCallbackQuery({ text: "Klaida generuojant nuorodą." });
        }
    }
});

export default composer;
