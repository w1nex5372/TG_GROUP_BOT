import cron from "node-cron";
import { Pool } from "pg";
import { getLeaderboard, saveWeeklyWinners, resetWeeklyPoints } from "../database/referrals_sql";
import { bot } from "../bot";
import { channel_log } from "../logger";

// ── Prizes: 1st / 2nd / 3rd place tokens ─────────────────────────────────────
const PRIZES = [1000, 500, 250];
const LABELS = ["🥇 1-a vieta", "🥈 2-a vieta", "🥉 3-a vieta"];

// ── Lazy Render PostgreSQL pool ───────────────────────────────────────────────
let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.SPINWAR_DB_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Monday 00:00:00 UTC of the current week. */
function currentWeekStart(): Date {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun … 6=Sat
    const diff = (day === 0 ? -6 : 1 - day); // days back to Monday
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
    return monday;
}

// ── Core reward distribution ──────────────────────────────────────────────────

export async function runWeeklyRewards(): Promise<void> {
    console.log("[WeeklyRewards] Starting distribution...");

    const leaderboard = await getLeaderboard(); // sorted by weekly_points DESC
    const winners = leaderboard.slice(0, 3);

    if (winners.length === 0) {
        console.log("[WeeklyRewards] No users with weekly points, skipping awards.");
        channel_log("🏆 Savaitės apdovanojimai: niekas nepelnė taškų šią savaitę.");
        await resetWeeklyPoints();
        return;
    }

    const db = getPool();
    const weekStart = currentWeekStart();
    const logLines: string[] = ["🏆 <b>Savaitės apdovanojimai išdalinti!</b>", ""];
    const historyRows: Parameters<typeof saveWeeklyWinners>[0] = [];

    for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        const prize  = PRIZES[i];
        const label  = LABELS[i];
        const name   = winner.username ? `@${winner.username}` : `User #${winner.user_id}`;

        try {
            const res = await db.query<{ token_balance: number }>(
                `UPDATE users
                    SET token_balance = token_balance + $1
                  WHERE telegram_id = $2
                  RETURNING token_balance`,
                [prize, Number(winner.user_id)],
            );

            if ((res.rowCount ?? 0) === 0) {
                logLines.push(`${label}: ${name} (${winner.weekly_points} tšk) — ⚠️ nėra SpinWar paskyros`);
                console.log(`[WeeklyRewards] ${label}: user=${winner.user_id} not in Render DB`);
            } else {
                const newBalance = res.rows[0].token_balance;
                logLines.push(`${label}: ${name} — ${winner.weekly_points} tšk → +${prize} tokenų (balansas: ${newBalance})`);
                console.log(`[WeeklyRewards] ${label}: user=${winner.user_id} (${name}) weekly=${winner.weekly_points}pts +${prize} tokens`);

                // DM winner
                try {
                    await bot.api.sendMessage(
                        Number(winner.user_id),
                        `🏆 <b>Savaitės nugalėtojas!</b>\n\n` +
                        `Sveikiname! Tu užėmei <b>${i + 1} vietą</b> šios savaitės lyderių lentelėje.\n\n` +
                        `📊 Tavo savaitės taškai: <b>${winner.weekly_points}</b>\n` +
                        `🎁 Apdovanojimas: <b>+${prize} tokenų</b> pridėta prie tavo balanso!\n\n` +
                        `Naudok juos SpinWar arba Parduotuvėje 🎰🛍️`,
                        { parse_mode: "HTML" },
                    );
                } catch {
                    console.log(`[WeeklyRewards] Could not DM user=${winner.user_id} (bot blocked)`);
                }
            }

            historyRows.push({
                user_id:       winner.user_id,
                username:      winner.username,
                place:         i + 1,
                weekly_points: winner.weekly_points,
                tokens_awarded: prize,
            });

        } catch (err) {
            console.error(`[WeeklyRewards] DB error for user=${winner.user_id}:`, err);
            logLines.push(`${label}: ${name} — ❌ klaida`);
        }
    }

    // Save history
    try {
        await saveWeeklyWinners(historyRows, weekStart);
    } catch (err) {
        console.error("[WeeklyRewards] Failed to save history:", err);
    }

    // Reset weekly points
    const resetCount = await resetWeeklyPoints();
    logLines.push("", `♻️ weekly_points atstatyti (${resetCount} vartotojų)`);
    console.log(`[WeeklyRewards] Reset weekly_points for ${resetCount} users.`);

    channel_log(logLines.join("\n"));
    console.log("[WeeklyRewards] Done.");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function startWeeklyRewards(): void {
    if (!process.env.SPINWAR_DB_URL) {
        console.log("[WeeklyRewards] SPINWAR_DB_URL not set — skipping.");
        return;
    }

    // Default: every Monday at 10:00 UTC (12:00 LT winter / 13:00 LT summer)
    const expr = process.env.WEEKLY_REWARDS_CRON ?? "0 10 * * 1";

    cron.schedule(expr, async () => {
        try {
            await runWeeklyRewards();
        } catch (err) {
            console.error("[WeeklyRewards] Unexpected error:", err);
        }
    });

    console.log(`[WeeklyRewards] Scheduled: "${expr}"`);
}
