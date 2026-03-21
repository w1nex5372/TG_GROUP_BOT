import { prisma } from "./index";
import crypto from "crypto";

function generateRefCode(): string {
    return crypto.randomBytes(5).toString("hex"); // 10-char hex
}

// ── invite_link helpers (raw SQL — bypasses generated client types) ──────────

/**
 * Store a generated Telegram invite link for the referred user.
 * Safe to call even if the referral_events row was just created.
 */
export async function updateReferralInviteLink(referredId: bigint, inviteLink: string): Promise<void> {
    await prisma.$executeRaw`
        UPDATE "referral_events"
        SET    "invite_link" = ${inviteLink}
        WHERE  "referred_id" = ${referredId}
    `;
}

/**
 * Fetch only the stored invite link for a referred user.
 * Returns null if not set or if the row doesn't exist.
 */
export async function getReferralInviteLink(referredId: bigint): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ invite_link: string | null }[]>`
        SELECT "invite_link"
        FROM   "referral_events"
        WHERE  "referred_id" = ${referredId}
        LIMIT  1
    `;
    return rows[0]?.invite_link ?? null;
}

// ── ref_code helpers ──────────────────────────────────────────────────────────

export async function ensureRefCode(userId: bigint): Promise<string> {
    const user = await prisma.users.findUnique({
        where: { user_id: userId },
        select: { ref_code: true },
    });
    if (user?.ref_code) return user.ref_code;

    // Generate a code unique in the table
    let code = generateRefCode();
    for (let i = 0; i < 10; i++) {
        const clash = await prisma.users.findUnique({ where: { ref_code: code } });
        if (!clash) break;
        code = generateRefCode();
    }

    await prisma.users.upsert({
        where: { user_id: userId },
        update: { ref_code: code },
        create: { user_id: userId, ref_code: code },
    });
    return code;
}

export async function getUserByRefCode(code: string): Promise<{ user_id: bigint } | null> {
    return prisma.users.findUnique({
        where: { ref_code: code },
        select: { user_id: true },
    });
}

// ── referral_events helpers ───────────────────────────────────────────────────

export async function getReferralEvent(referredId: bigint) {
    return prisma.referral_events.findUnique({ where: { referred_id: referredId } });
}

export async function createReferralEvent(
    referrerId: bigint,
    referredId: bigint,
    pending: boolean,
    expiresAt: Date | null,
): Promise<void> {
    await prisma.referral_events.upsert({
        where: { referred_id: referredId },
        update: {},
        create: {
            referrer_id: referrerId,
            referred_id: referredId,
            pending,
            expires_at: expiresAt,
        },
    });
}

export async function confirmReferral(referredId: bigint): Promise<boolean> {
    const event = await prisma.referral_events.findUnique({ where: { referred_id: referredId } });
    if (!event || !event.pending || event.confirmed_at !== null) return false;
    if (event.expires_at && event.expires_at < new Date()) return false;

    await prisma.referral_events.update({
        where: { referred_id: referredId },
        data: { pending: false, confirmed_at: new Date() },
    });
    return true;
}

export async function getDailyConfirmedCount(referrerId: bigint): Promise<number> {
    const since = new Date(Date.now() - 86_400_000);
    return prisma.referral_events.count({
        where: { referrer_id: referrerId, pending: false, confirmed_at: { gte: since } },
    });
}

export async function getTotalConfirmedCount(referrerId: bigint): Promise<number> {
    return prisma.referral_events.count({
        where: { referrer_id: referrerId, pending: false, confirmed_at: { not: null } },
    });
}

// ── Points helpers ────────────────────────────────────────────────────────────

/** Increment a user's points by `amount`. User row must already exist. */
export async function addPoints(userId: bigint, amount: number): Promise<void> {
    await prisma.users.update({
        where: { user_id: userId },
        data: { points: { increment: amount } },
    });
}

/** Return the user's current point total (0 if not found). */
export async function getUserPoints(userId: bigint): Promise<number> {
    const user = await prisma.users.findUnique({
        where: { user_id: userId },
        select: { points: true },
    });
    return user?.points ?? 0;
}

// ── Leaderboard — ranked by points DESC ───────────────────────────────────────
// Tie-breaking: confirmed referrals DESC, then user_id ASC (deterministic).

export async function getLeaderboard(): Promise<
    { user_id: bigint; username: string | null; points: number }[]
> {
    // Raw query so we can sort by a subquery aggregate for tie-breaking.
    const rows = await prisma.$queryRaw<
        { user_id: bigint; username: string | null; points: bigint | number }[]
    >`
        SELECT u.user_id, u.username, u.points
        FROM   users u
        WHERE  u.points > 0
        ORDER BY
            u.points DESC,
            (SELECT COUNT(*) FROM referral_events re
             WHERE  re.referrer_id = u.user_id
               AND  re.pending     = false
               AND  re.confirmed_at IS NOT NULL) DESC,
            u.user_id ASC
        LIMIT 10
    `;
    return rows.map((r) => ({ ...r, points: Number(r.points) }));
}

// ── /mystats helpers ──────────────────────────────────────────────────────────

/**
 * Returns full stats for a user.
 * Rank is derived from the identical ordering used by getLeaderboard()
 * (all rows, no LIMIT) so the two views are always consistent.
 */
export async function getUserStats(userId: bigint): Promise<{
    points: number;
    botInvites: number;    // referral events created (any status)
    groupInvites: number;  // confirmed group joins
    rank: number | null;   // null → 0 points, not in ranking
    gap: number | null;    // null → rank #1 or not ranked
}> {
    const points = await getUserPoints(userId);

    const botInvites = await prisma.referral_events.count({
        where: { referrer_id: userId },
    });
    const groupInvites = await getTotalConfirmedCount(userId);

    if (points === 0) {
        return { points: 0, botInvites, groupInvites, rank: null, gap: null };
    }

    // Fetch all ranked users using the same ORDER BY as getLeaderboard (no LIMIT).
    const allRanked = await prisma.$queryRaw<
        { user_id: bigint; points: bigint | number }[]
    >`
        SELECT u.user_id, u.points
        FROM   users u
        WHERE  u.points > 0
        ORDER BY
            u.points DESC,
            (SELECT COUNT(*) FROM referral_events re
             WHERE  re.referrer_id = u.user_id
               AND  re.pending     = false
               AND  re.confirmed_at IS NOT NULL) DESC,
            u.user_id ASC
    `;

    const idx = allRanked.findIndex((r) => r.user_id === userId);
    if (idx === -1) {
        return { points, botInvites, groupInvites, rank: null, gap: null };
    }

    const rank = idx + 1;
    const gap = rank > 1 ? Number(allRanked[idx - 1].points) - points : null;
    return { points, botInvites, groupInvites, rank, gap };
}

// ── XP / Level helpers ────────────────────────────────────────────────────────
// 1 confirmed referral = 1 XP.
// L1: 0–2 (range 3) | L2: 3–5 (range 3) | LN≥3: range = N+1

/** XP needed to complete a given level (i.e. its width). */
export function getLevelRange(level: number): number {
    if (level <= 2) return 3;
    return level + 1;
}

/** Cumulative XP at which a given level begins. */
export function getLevelStart(level: number): number {
    let start = 0;
    for (let l = 1; l < level; l++) start += getLevelRange(l);
    return start;
}

/** Derive level from total XP. Caps at 50 for safety. */
export function getUserLevel(xp: number): number {
    let level = 1;
    while (level < 50 && xp >= getLevelStart(level + 1)) level++;
    return level;
}

/**
 * Text progress bar using block characters.
 * Example: buildProgressBar(3, 10) → "███░░░░░░░ 30%"
 */
export function buildProgressBar(current: number, total: number, width = 10): string {
    const pct = total > 0 ? Math.min(current / total, 1) : 0;
    const filled = Math.round(pct * width);
    return "█".repeat(filled) + "░".repeat(width - filled) + ` ${Math.round(pct * 100)}%`;
}

function rankName(level: number): string {
    const names = ["Naujokas", "Kylantis", "Aktyvus", "Veteranas", "Elitas", "Legenda"];
    return names[Math.min(level - 1, names.length - 1)];
}

function invWord(n: number): string {
    if (n % 10 === 1 && n % 100 !== 11) return "pakvietimas";
    if (n % 10 >= 2 && n % 10 <= 9 && (n % 100 < 10 || n % 100 >= 20)) return "pakvietimai";
    return "pakvietimų";
}

function motivLine(xp: number, rank: number | null, xpToNext: number): string {
    if (xp === 0)                   return "💬 Pakviesk pirmą draugą ir pradėk kelionę!";
    if (rank === 1)                 return "👑 Tu esi lyderis. Nepaleisk pirmosios vietos.";
    if (rank !== null && rank <= 3) return "🏆 Tu jau tarp stipriausių kvietėjų.";
    return `💬 Dar ${xpToNext} ${invWord(xpToNext)} ir pakilsi aukščiau!`;
}

// ── /resetref — hard reset: wipes ALL referral/points/onboarding state ────────

export interface ResetReferralResult {
    // Incoming referral (target was referred BY someone)
    incomingEvent: boolean;
    referrerId: bigint | null;
    referrerPointsDeducted: number;   // points removed from referrer's balance
    incomingStage: "none" | "stage1_only" | "stage2_confirmed";

    // Outgoing referrals (target acted as referrer for others)
    outgoingEventsDeleted: number;    // referral_events rows where referrer_id = target

    // Target user row
    userExisted: boolean;
    userPointsWiped: number;          // full points balance zeroed
    refCodeCleared: boolean;          // ref_code set to null
    referredByCleared: boolean;       // referred_by field cleared
}

/**
 * Hard reset: treats `targetId` as if they never interacted with the bot.
 *
 * What is wiped (in order):
 *   1. Incoming referral_events row (referred_id = target) → deleted
 *      → referrer's points reversed (stage1: −1, stage1+2: −2)
 *   2. All outgoing referral_events rows (referrer_id = target) → deleted
 *      → target's stats (/mystats) will show zero activity
 *   3. users.points → zeroed (complete clean slate, covers all earned points)
 *   4. users.ref_code → null (fresh code on next /invite)
 *   5. users.referred_by → null
 *
 * Points reversal for the referrer:
 *   - stage1 only (pending=true, confirmed_at=null): referrer −1
 *   - stage2 confirmed (confirmed_at != null):       referrer −2, user points zeroed
 *   - Points are floored at 0 (never go negative).
 *
 * Idempotent: safe to call multiple times on the same user.
 */
export async function resetReferral(targetId: bigint): Promise<ResetReferralResult> {
    // ── Step 1: Snapshot and remove the INCOMING referral event ─────────────
    const incoming = await prisma.referral_events.findUnique({
        where: { referred_id: targetId },
    });

    let referrerId: bigint | null = null;
    let referrerPointsDeducted = 0;
    let incomingStage: ResetReferralResult["incomingStage"] = "none";

    if (incoming) {
        referrerId = incoming.referrer_id;
        const stage2 = incoming.confirmed_at !== null;
        incomingStage = stage2 ? "stage2_confirmed" : "stage1_only";
        // Stage 1 always fired (+1 to referrer).
        // Stage 2 fired on group join (+1 referrer again, +1 user welcome bonus).
        referrerPointsDeducted = stage2 ? 2 : 1;

        const referrerCurrent = await getUserPoints(referrerId);
        await prisma.users.update({
            where: { user_id: referrerId },
            data: { points: Math.max(0, referrerCurrent - referrerPointsDeducted) },
        });

        await prisma.referral_events.delete({ where: { referred_id: targetId } });
    }

    // ── Step 2: Remove all OUTGOING referral events (target was referrer) ────
    // Deleting these rows zeros the target's botInvites/groupInvites in /mystats.
    // We do NOT touch the referred users (their welcome bonuses stay — they are
    // not being reset, only the target is).
    const outgoing = await prisma.referral_events.deleteMany({
        where: { referrer_id: targetId },
    });

    // ── Step 3: Snapshot and hard-wipe the target's user row ────────────────
    const userRow = await prisma.users.findUnique({
        where: { user_id: targetId },
        select: { points: true, ref_code: true, referred_by: true },
    });

    const userExisted = userRow !== null;
    const userPointsWiped = userRow?.points ?? 0;
    const refCodeCleared = userRow?.ref_code != null;
    const referredByCleared = userRow?.referred_by != null;

    if (userExisted) {
        await prisma.users.update({
            where: { user_id: targetId },
            data: {
                points: 0,
                ref_code: null,
                referred_by: null,
            },
        });
    }

    return {
        incomingEvent: !!incoming,
        referrerId,
        referrerPointsDeducted,
        incomingStage,
        outgoingEventsDeleted: outgoing.count,
        userExisted,
        userPointsWiped,
        refCodeCleared,
        referredByCleared,
    };
}

const DIVIDER = "─────────────────";

/** Genitive form of "taškas" for use after a number (e.g. "trūksta 1 taško"). */
function gapWord(n: number): string {
    return n % 10 === 1 && n % 100 !== 11 ? "taško" : "taškų";
}

/** Formats stats into a ready-to-send Lithuanian message string. */
export async function buildStatsText(userId: bigint): Promise<string> {
    const { groupInvites, rank, gap } = await getUserStats(userId);

    const xp       = groupInvites;
    const level    = getUserLevel(xp);
    const lvlStart = getLevelStart(level);
    const lvlRange = getLevelRange(level);
    const xpIn     = xp - lvlStart;
    const xpToNext = lvlRange - xpIn;

    const inv = groupInvites === 1 ? "draugą" : "draugų";

    const lines: string[] = [
        "🏆 Tavo statistika",
        "",
        `🎯 Lygis: ${level}  ·  🎖 ${rankName(level)}`,
        `⚡ XP: ${xpIn} / ${lvlRange}`,
        "",
        "📈 Progresas",
        buildProgressBar(xpIn, lvlRange),
        "",
        `👥 Pakvietei: ${groupInvites} ${inv}`,
        `🏅 Tavo vieta: ${rank !== null ? "#" + rank : "—"}`,
        "",
        "📊 Iki kito lygio:",
        `reikia dar ${xpToNext} ${invWord(xpToNext)}`,
    ];

    // Gap to player above
    if (gap !== null && gap > 0) {
        lines.push(
            "",
            "🔥 Iki aukščiau esančio žaidėjo:",
            `trūksta ${gap} ${gapWord(gap)}`,
        );
    } else if (rank === 1) {
        lines.push("", "👑 Tu esi lyderis! Nepaleisk pirmosios vietos.");
    } else if (rank === null) {
        lines.push("", "💬 Pakviesk pirmą draugą ir pradėk kelionę!");
    }

    return lines.join("\n");
}
