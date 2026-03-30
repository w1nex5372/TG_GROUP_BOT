import { bot } from "../bot";
import { Composer, InlineKeyboard } from "grammy";
import constants from "../config";
import { prisma } from "../database/index";
import {
    getUserByRefCode,
    getReferralEvent,
    createReferralEvent,
    confirmReferral,
    getDailyConfirmedCount,
    getTotalConfirmedCount,
    getLeaderboard,
    buildStatsText,
    addPoints,
    getUserPoints,
    resetReferral,
    updateReferralInviteLink,
    getReferralInviteLink,
    getDirectInviteEvent,
    createDirectInviteEvent,
    markDirectInviteBotStarted,
} from "../database/referrals_sql";
import { getGroupInviteUrl, setSetting } from "../database/settings_sql";
import { clearGuideState } from "./onboarding";
import { buildMainMenu } from "../ui/buttons";
import { GUIDE_MENU_TEXT, buildLeaderboardMessage } from "../ui/messages";
import { E } from "../ui/emoji";

const composer = new Composer();

const REF_REQUIRE_GROUP_JOIN = constants.REF_REQUIRE_GROUP_JOIN !== "false";
const REF_JOIN_WINDOW_HOURS = Number(constants.REF_JOIN_WINDOW_HOURS || "24");
const REF_DAILY_CAP = Number(constants.REF_DAILY_CAP || "20");
const GROUP_ID = constants.GROUP_ID ? Number(constants.GROUP_ID) : null;

// ── Shared helper: confirm a pending referral and notify the referrer ─────────
// Idempotent: confirmReferral() returns false if already confirmed or expired.

async function handleGroupJoin(userId: bigint, user: { id: number; username?: string; first_name: string }): Promise<void> {
    const event = await getReferralEvent(userId);
    if (!event || !event.pending) return;

    const dailyCount = await getDailyConfirmedCount(event.referrer_id);
    if (dailyCount >= REF_DAILY_CAP) {
        console.log(`[Referrals] daily cap hit for referrer=${event.referrer_id}`);
        return;
    }

    const confirmed = await confirmReferral(userId);
    if (!confirmed) return;

    console.log(`[Referrals] confirmed: referrer=${event.referrer_id} referred=${userId}`);

    // Stage 2 — group join: +1 to referrer, +1 welcome bonus to invited user
    await addPoints(event.referrer_id, 1);
    await addPoints(userId, 1);
    console.log(`[Points] stage2 +1 referrer=${event.referrer_id}, +1 welcome user=${userId}`);

    const totalPoints = await getUserPoints(event.referrer_id);
    const displayName = user.username ? `@${user.username}` : user.first_name;

    // Notify referrer: stage 2 point added
    try {
        await bot.api.sendMessage(
            Number(event.referrer_id),
            `✅ +1 taškas! ${displayName} prisijungė prie grupės. Iš viso: ${totalPoints} taškų`,
        );
    } catch (err: any) {
        console.log(`[Referrals] could not notify referrer=${event.referrer_id}: ${err?.description ?? err}`);
    }

    // Send full menu to the invited user — they've now joined, unlock the full experience
    try {
        const inviteUrl = await getGroupInviteUrl();
        const postJoinText =
            `✅ Puiku! Dabar esi mūsų bendruomenės narys.\n\n` +
            `Naudokis visomis funkcijomis 👇`;
        await bot.api.sendMessage(Number(userId), postJoinText, { reply_markup: buildMainMenu(inviteUrl) });
        console.log(`[Referrals] post-join menu sent -> user=${userId}`);
    } catch (err: any) {
        console.log(`[Referrals] could not send post-join menu to user=${userId}: ${err?.description ?? err}`);
    }
}

// ── Direct group add tracking ─────────────────────────────────────────────────
// Fires when an admin/member adds someone directly via "Add Members".
// Ref-link joins take priority — if a referral_event already exists, skip.

async function handleDirectAdd(
    invitedId: bigint,
    inviterId: bigint,
    user: { id: number; username?: string; first_name: string },
): Promise<void> {
    if (inviterId === invitedId) return;

    // Ref link takes priority
    const refEvent = await getReferralEvent(invitedId);
    if (refEvent) return;

    // Idempotent — skip if already recorded
    const existing = await getDirectInviteEvent(invitedId);
    if (existing) return;

    await createDirectInviteEvent(inviterId, invitedId);
    console.log(`[DirectInvite] recorded: inviter=${inviterId} invited=${invitedId}`);

    // Group join is already confirmed → +2 to inviter immediately
    await addPoints(inviterId, 2);
    console.log(`[Points] direct invite +2 -> inviter=${inviterId}`);

    const displayName = user.username ? `@${user.username}` : user.first_name;
    const totalPoints = await getUserPoints(inviterId);

    try {
        await bot.api.sendMessage(
            Number(inviterId),
            `✅ +2 taškai! ${displayName} buvo pakviesti į grupę. Iš viso: ${totalPoints} taškų`,
        );
    } catch (err: any) {
        console.log(`[DirectInvite] could not notify inviter=${inviterId}: ${err?.description ?? err}`);
    }
}

// ── Per-user invite link generation ──────────────────────────────────────────

/**
 * Calls Telegram createChatInviteLink with member_limit=1.
 * Returns the invite_link string on success, null on failure (bot not admin, etc.).
 */
async function generateGroupInviteLink(
    groupId: number,
    userId: bigint,
    refCode: string,
): Promise<string | null> {
    try {
        const label = `ref_${refCode}_${String(userId).slice(-6)}`;
        const result = await bot.api.createChatInviteLink(groupId, {
            member_limit: 1,
            creates_join_request: false,
            name: label,
        });
        console.log(`[Referrals] invite link created -> user=${userId} link=${result.invite_link}`);
        return result.invite_link;
    } catch (err: any) {
        console.error(
            `[Referrals] failed to create invite link for user=${userId}: ${err?.description ?? err}`,
        );
        return null;
    }
}

/**
 * Resolves the join URL for a referred user:
 * 1. Use already-stored per-user invite link (if present).
 * 2. Try to generate a fresh one via Telegram API and persist it.
 * 3. Fall back to the static group invite URL (always works).
 */
async function resolveJoinUrl(
    referredId: bigint,
    refCode: string,
    groupId: number | null,
): Promise<string> {
    // Always generate a fresh link — stored links can expire or hit member_limit.
    if (groupId !== null) {
        const generated = await generateGroupInviteLink(groupId, referredId, refCode);
        if (generated) {
            await updateReferralInviteLink(referredId, generated);
            return generated;
        }
    }

    // Fallback: static group invite URL
    return getGroupInviteUrl();
}

// ── /start ref_<code> in private ─────────────────────────────────────────────
// Registered on bot directly so it fires before bot.use(modules).

bot.chatType("private").command("start", async (ctx: any, next: () => Promise<void>) => {
    const payload: string = ctx.match ?? "";
    if (!payload.startsWith("ref_")) {
        // Welcome bonus for users who were directly added to the group
        const userId = BigInt(ctx.from.id);
        const username: string | null = ctx.from.username ?? null;
        await prisma.users.upsert({
            where: { user_id: userId },
            update: { username },
            create: { user_id: userId, username },
        });
        const directInvite = await getDirectInviteEvent(userId);
        if (directInvite && !directInvite.bot_started_at) {
            await markDirectInviteBotStarted(userId);
            await addPoints(userId, 1);
            console.log(`[Points] direct invite welcome +1 -> user=${userId}`);
        }
        return next();
    }

    const code = payload.slice(4);
    const userId = BigInt(ctx.from.id);
    const username: string | null = ctx.from.username ?? null;

    // Ensure user row exists
    await prisma.users.upsert({
        where: { user_id: userId },
        update: { username },
        create: { user_id: userId, username },
    });

    // Validate code
    const referrer = await getUserByRefCode(code);
    if (!referrer) {
        await ctx.reply("👋 Sveikas! Referral kodas nerastas.");
        return;
    }
    if (referrer.user_id === userId) {
        await ctx.reply("👋 Sveikas! Tai tavo paties nuoroda.");
        return;
    }

    // No double credit — but re-show the join button if they're still pending
    const existing = await getReferralEvent(userId);
    if (existing) {
        // Already confirmed → they're in the group, show main menu
        if (existing.confirmed_at !== null) {
            return next();
        }
        // Still pending → re-show their unique join link
        const joinUrl = await resolveJoinUrl(userId, code, GROUP_ID);
        const kb = new InlineKeyboard()
            .url(`${E.group} Prisijungti prie grupės`, joinUrl).row()
            .text(`${E.home} Atidaryti meniu`, "guide:menu");
        await ctx.reply(
            `👋 Sveikas atgal!\n\n` +
            `Tavo pakvietimas vis dar laukia.\n` +
            `Prisijunk prie grupės, kad gautum taškus 👇`,
            { reply_markup: kb },
        );
        return;
    }

    // Create referral event
    const pending = REF_REQUIRE_GROUP_JOIN && GROUP_ID !== null;
    const expiresAt = pending ? new Date(Date.now() + REF_JOIN_WINDOW_HOURS * 3_600_000) : null;
    await createReferralEvent(referrer.user_id, userId, pending, expiresAt);

    // Store referred_by in users table
    await prisma.users.update({
        where: { user_id: userId },
        data: { referred_by: referrer.user_id },
    });

    console.log(`[Referrals] new: referrer=${referrer.user_id} referred=${userId} pending=${pending}`);

    // Stage 1 — bot registration: +1 to referrer
    await addPoints(referrer.user_id, 1);
    console.log(`[Points] stage1 +1 -> referrer=${referrer.user_id}`);

    // Generate per-user invite link (member_limit=1) and persist it
    const joinUrl = await resolveJoinUrl(userId, code, GROUP_ID);

    // Warm referral welcome — single CTA using the unique link
    const welcomeText =
        `👋 Sveikas!\n\n` +
        `Sveiki atvykę į mūsų bendruomenę.\n\n` +
        `Tave pakvietė draugas — prisijunk prie grupės\n` +
        `ir abu gausite taškų! 🎉\n\n` +
        `Prisijungęs prie grupės galėsi naudotis visomis funkcijomis.\n\n` +
        `Spausk mygtuką žemiau 👇`;

    const kb = new InlineKeyboard()
        .url(`${E.group} Prisijungti prie grupės`, joinUrl).row()
        .text(`${E.home} Atidaryti meniu`, "guide:menu");
    await ctx.reply(welcomeText, { reply_markup: kb });

    if (pending) {
        // Notify referrer: stage 1 point, waiting for group join
        try {
            await bot.api.sendMessage(
                Number(referrer.user_id),
                `👀 +1 taškas! Tavo pakviestas žmogus atėjo į botą. Liko prisijungti prie grupės — tada gausite dar po taškų!`,
            );
        } catch (err: any) {
            console.log(`[Referrals] could not notify referrer=${referrer.user_id}: ${err?.description ?? err}`);
        }
    } else {
        // REF_REQUIRE_GROUP_JOIN=false: immediate confirm — stage 2 also fires now
        await prisma.referral_events.update({
            where: { referred_id: userId },
            data: { confirmed_at: new Date() },
        });
        await addPoints(referrer.user_id, 1); // stage 2 referrer +1
        await addPoints(userId, 1);           // stage 2 welcome bonus +1
        console.log(`[Points] stage2 immediate: referrer=${referrer.user_id} referred=${userId}`);

        const totalPoints = await getUserPoints(referrer.user_id);
        const displayName = username ? `@${username}` : ctx.from.first_name;
        try {
            await bot.api.sendMessage(
                Number(referrer.user_id),
                `✅ +2 taškai! ${displayName} užsiregistravo per tavo nuorodą. Iš viso: ${totalPoints} taškų`,
            );
        } catch (err: any) {
            console.log(`[Referrals] could not notify referrer=${referrer.user_id}: ${err?.description ?? err}`);
        }
    }
});

// ── Confirm pending referral on group join (service message) ─────────────────

composer.on("message:new_chat_members", async (ctx: any) => {
    if (!GROUP_ID || ctx.chat.id !== GROUP_ID) return;

    const newMembers: any[] = ctx.message.new_chat_members ?? [];
    const fromId: bigint | null = ctx.message.from?.id ? BigInt(ctx.message.from.id) : null;

    for (const member of newMembers) {
        if (member.is_bot) continue;
        const memberId = BigInt(member.id);
        await handleGroupJoin(memberId, member);
        // If added by someone else (not joined by themselves via link), track direct invite
        if (fromId && fromId !== memberId && !ctx.message.from?.is_bot) {
            await handleDirectAdd(memberId, fromId, member);
        }
    }
});

// ── Confirm pending referral on group join (chat_member update) ───────────────
// Fires for joins that don't produce a service message (e.g. invite links, admin adds).

composer.on("chat_member", async (ctx: any) => {
    if (!GROUP_ID || ctx.chatMember?.chat?.id !== GROUP_ID) return;

    const oldStatus: string = ctx.chatMember.old_chat_member?.status ?? "";
    const newMember = ctx.chatMember.new_chat_member;
    if (!newMember || newMember.user?.is_bot) return;

    const wasAbsent = ["left", "kicked", "banned"].includes(oldStatus);
    const isNowPresent =
        ["member", "administrator", "creator"].includes(newMember.status) ||
        (newMember.status === "restricted" && newMember.is_member === true);

    if (!wasAbsent || !isNowPresent) return;

    const invitedId = BigInt(newMember.user.id);
    await handleGroupJoin(invitedId, newMember.user);

    // Detect direct add: from.id !== new_member.id means an admin added them
    const from = ctx.chatMember.from;
    if (from && !from.is_bot && BigInt(from.id) !== invitedId) {
        await handleDirectAdd(invitedId, BigInt(from.id), newMember.user);
    }
});

// ── /setgroupurl — registered on bot directly so it works in DM and group ────

bot.command("setgroupurl", async (ctx: any) => {
    const fromId = String(ctx.from?.id);
    const isOwner = fromId === String(constants.OWNER_ID);
    const isSuperuser = Array.isArray(constants.SUPERUSERS)
        ? constants.SUPERUSERS.includes(fromId)
        : String(constants.SUPERUSERS).includes(fromId);

    if (!isOwner && !isSuperuser) return;

    const url: string = (ctx.match ?? "").trim();
    if (!url) {
        await ctx.reply("Naudojimas: /setgroupurl <nuoroda>\nPavyzdys: /setgroupurl https://t.me/+xxxx");
        return;
    }
    if (!url.startsWith("https://t.me/")) {
        await ctx.reply("❌ Nuoroda turi prasidėti https://t.me/");
        return;
    }

    await setSetting("group_invite_url", url);
    await ctx.reply("✅ Grupės nuoroda atnaujinta.");
    console.log(`[Settings] group_invite_url set by user=${fromId} -> ${url}`);
});

// ── /debugref <user_id> — SUPERUSERS debug ───────────────────────────────────

bot.command("debugref", async (ctx: any) => {
    const fromId = String(ctx.from?.id);
    const isOwner = fromId === String(constants.OWNER_ID);
    const isSuperuser = Array.isArray(constants.SUPERUSERS)
        ? constants.SUPERUSERS.includes(fromId)
        : String(constants.SUPERUSERS).includes(fromId);

    if (!isOwner && !isSuperuser) return;

    const arg = (ctx.match ?? "").trim();
    if (!arg || !/^\d+$/.test(arg)) {
        await ctx.reply("Naudojimas: /debugref <user_id>\nPavyzdys: /debugref 123456789");
        return;
    }

    const targetId = BigInt(arg);

    // Group membership
    let memberStatus = "N/A (GROUP_ID not set)";
    if (GROUP_ID) {
        try {
            const member = await ctx.api.getChatMember(GROUP_ID, Number(targetId));
            memberStatus = member.status;
        } catch (err: any) {
            memberStatus = `error: ${err?.description ?? String(err)}`;
        }
    }

    // Referral event
    const event = await getReferralEvent(targetId);
    if (!event) {
        await ctx.reply(
            `🔍 User <code>${arg}</code>\n\n` +
            `👥 Grupės statusas: <b>${memberStatus}</b>\n` +
            `📋 Referral: <b>nerastas</b>`,
            { parse_mode: "HTML" },
        );
        return;
    }

    const refStatus = event.confirmed_at
        ? `✅ patvirtintas`
        : event.pending
            ? `⏳ laukiama`
            : `❌ nepartvirtintas`;

    const inviteLink = await getReferralInviteLink(targetId);

    const lines = [
        `🔍 User <code>${arg}</code>`,
        ``,
        `👥 Grupės statusas: <b>${memberStatus}</b>`,
        `📋 Referral: <b>${refStatus}</b>`,
        `↩️ Referrer: <code>${String(event.referrer_id)}</code>`,
        `🕐 Sukurta: ${event.created_at.toISOString()}`,
        event.expires_at ? `⏱ Galioja iki: ${event.expires_at.toISOString()}` : null,
        event.confirmed_at ? `✅ Patvirtinta: ${event.confirmed_at.toISOString()}` : null,
        inviteLink ? `🔗 Nuoroda: <code>${inviteLink}</code>` : `🔗 Nuoroda: —`,
    ].filter(Boolean).join("\n");

    await ctx.reply(lines, { parse_mode: "HTML" });
    console.log(`[Referrals] /debugref user=${arg} by=${fromId}`);
});

// ── /resetref <user_id> — SUPERUSERS only, hard reset of all referral state ───

bot.command("resetref", async (ctx: any) => {
    const fromId = String(ctx.from?.id);
    const isOwner = fromId === String(constants.OWNER_ID);
    const isSuperuser = Array.isArray(constants.SUPERUSERS)
        ? constants.SUPERUSERS.includes(fromId)
        : String(constants.SUPERUSERS).includes(fromId);

    if (!isOwner && !isSuperuser) return;

    const arg = (ctx.match ?? "").trim();
    if (!arg || !/^\d+$/.test(arg)) {
        await ctx.reply(
            "Naudojimas: /resetref <user_id>\n" +
            "Pavyzdys: /resetref 123456789\n\n" +
            "⚠️ Hard reset: ištrina VISĄ referral/taškų/onboarding būseną."
        );
        return;
    }

    const targetId = BigInt(arg);
    const r = await resetReferral(targetId);

    // Clear in-memory guide throttle — user can /start as fresh immediately
    clearGuideState(Number(targetId));

    // Build removed / not-found lists
    const removed: string[] = [];
    const notFound: string[] = [];

    // Incoming referral
    if (r.incomingEvent) {
        removed.push("✓ referral start event (incoming)");
        if (r.incomingStage === "stage1_only") {
            removed.push("✓ pending referral (not yet joined group)");
            notFound.push("- join confirmation (user never joined)");
            notFound.push("- welcome bonus (not yet earned)");
        } else {
            removed.push("✓ confirmed referral");
            removed.push("✓ join confirmation + confirmedAt timestamp");
            removed.push(`✓ welcome bonus wiped (was part of ${r.userPointsWiped} total pts)`);
        }
        removed.push(
            `✓ referrer points reversed: −${r.referrerPointsDeducted} ` +
            `(referrer: ${String(r.referrerId)})`
        );
    } else {
        notFound.push("- referral start event (user was not referred via link)");
        notFound.push("- pending / confirmed referral");
        notFound.push("- join confirmation");
        notFound.push("- welcome bonus");
        notFound.push("- referrer points to reverse");
    }

    // Outgoing referrals
    if (r.outgoingEventsDeleted > 0) {
        removed.push(`✓ outgoing referral events: ${r.outgoingEventsDeleted} row(s) (user's own invites)`);
    } else {
        notFound.push("- outgoing referral events (user had not invited anyone)");
    }

    // User row fields
    if (r.referredByCleared) {
        removed.push("✓ referred_by link field");
    } else {
        notFound.push("- referred_by field (was already null)");
    }
    if (r.refCodeCleared) {
        removed.push("✓ ref_code cleared (fresh code on next /invite)");
    } else {
        notFound.push("- ref_code (was not set)");
    }
    if (r.userPointsWiped > 0) {
        removed.push(`✓ points balance zeroed: was ${r.userPointsWiped} pts → 0`);
    } else {
        notFound.push("- points balance (was already 0)");
    }
    if (!r.userExisted) {
        notFound.push("- user row (user never opened the bot)");
    }

    // In-memory cache always cleared
    removed.push("✓ onboarding throttle + message cache (in-memory)");

    const lines = [
        `🧹 Hard reset complete`,
        ``,
        `User: ${arg}`,
        ``,
        `Removed:`,
        ...removed,
        ``,
        `Not found:`,
        ...notFound,
        ``,
        `Final result:`,
        `This user will now be treated as a completely new user.`,
        `Run /debugref ${arg} to verify — should show: nerastas`,
    ];

    await ctx.reply(lines.join("\n"));
    console.log(
        `[Referrals] /resetref user=${arg} by=${fromId} ` +
        `incoming=${r.incomingEvent} stage=${r.incomingStage} ` +
        `referrer=${String(r.referrerId)} referrer_pts_removed=${r.referrerPointsDeducted} ` +
        `outgoing_deleted=${r.outgoingEventsDeleted} user_pts_wiped=${r.userPointsWiped}`
    );
});

// ── /mystats ──────────────────────────────────────────────────────────────────

composer.command("mystats", async (ctx: any) => {
    const userId = BigInt(ctx.from?.id ?? 0);
    const text = await buildStatsText(userId);
    await ctx.reply(text);
});

// ── /leaderboard ──────────────────────────────────────────────────────────────

composer.command("leaderboard", async (ctx: any) => {
    const rows = await getLeaderboard();
    await ctx.reply(buildLeaderboardMessage(rows), { parse_mode: "HTML" });
});

export default composer;
