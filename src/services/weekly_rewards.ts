import cron from "node-cron";
import { Pool } from "pg";
import { getLeaderboard } from "../database/referrals_sql";
import { bot } from "../bot";
import { channel_log } from "../logger";

// ── Prizes: 1st / 2nd / 3rd place tokens ─────────────────────────────────────
const PRIZES  = [1000, 500, 200];
const LABELS  = ["🥇 1-a vieta", "🥈 2-a vieta", "🥉 3-a vieta"];

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

// ── Core reward distribution ──────────────────────────────────────────────────

export async function runWeeklyRewards(): Promise<void> {
    console.log("[WeeklyRewards] Starting distribution...");

    const leaderboard = await getLeaderboard(); // top 10, sorted by points DESC
    const winners = leaderboard.slice(0, 3);

    if (winners.length === 0) {
        console.log("[WeeklyRewards] Leaderboard empty, skipping.");
        channel_log("[WeeklyRewards] Savaitės apdovanojimai: lyderių lentelė tuščia.");
        return;
    }

    const db = getPool();
    const logLines: string[] = ["🏆 <b>Savaitės apdovanojimai išdalinti!</b>", ""];

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
                // User exists in lucynaBot but not in SpinWar/Shop yet
                logLines.push(`${label}: ${name} — ⚠️ nėra SpinWar paskyros`);
                console.log(`[WeeklyRewards] ${label}: user=${winner.user_id} not in Render DB`);
                continue;
            }

            const newBalance = res.rows[0].token_balance;
            logLines.push(`${label}: ${name} — +${prize} tokenų (balansas: ${newBalance})`);
            console.log(`[WeeklyRewards] ${label}: user=${winner.user_id} (${name}) +${prize} tokens → balance=${newBalance}`);

            // DM the winner
            try {
                await bot.api.sendMessage(
                    Number(winner.user_id),
                    `🏆 <b>Savaitės nugalėtojas!</b>\n\n` +
                    `Sveikiname! Tu užėmei <b>${i + 1} vietą</b> šios savaitės lyderių lentelėje.\n\n` +
                    `🎁 Apdovanojimas: <b>+${prize} tokenų</b> pridėta prie tavo balanso!\n\n` +
                    `Naudok juos SpinWar arba Parduotuvėje 🎰🛍️`,
                    { parse_mode: "HTML" },
                );
            } catch {
                console.log(`[WeeklyRewards] Could not DM user=${winner.user_id} (bot blocked)`);
            }

        } catch (err) {
            console.error(`[WeeklyRewards] DB error for user=${winner.user_id}:`, err);
            logLines.push(`${label}: ${name} — ❌ klaida`);
        }
    }

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
