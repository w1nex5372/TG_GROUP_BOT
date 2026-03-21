import { E } from "./emoji";

/** Thin horizontal rule for section dividers. */
export const DIVIDER = "─────────────────";

/**
 * Main DM guide welcome message (HTML).
 * Sent when a user opens the bot or clicks the guide deep-link.
 */
export const GUIDE_MENU_TEXT =
    `${E.hello} <b>Sveikas!</b>\n\n` +
    `Sveiki atvykę į mūsų bendruomenės botą.\n\n` +
    `Čia gali:\n\n` +
    `${E.trophy} kviesti draugus ir rinkti taškus\n` +
    `${E.stats} matyti lyderių sąrašą\n` +
    `${E.pin} rasti svarbią informaciją apie grupę\n\n` +
    `Pasirink veiksmą žemiau ${E.down}`;

/** Group rules page (HTML). */
export function buildRulesText(): string {
    return (
        `${E.rules} <b>Grupės taisyklės</b>\n\n` +
        `${E.cross} Reklama be leidimo – draudžiama\n` +
        `${E.cross} Linkai ir referral'ai – draudžiami\n` +
        `${E.cross} Spam / flood – mute arba ban\n\n` +
        `${E.verified} Reklama galima tik su admin leidimu\n\n` +
        `<i>Greita komanda: /rules</i>`
    );
}

/** Available bot commands page (HTML). */
export function buildCommandsText(): string {
    return (
        `${E.commands} <b>Komandos</b>\n\n` +
        `<code>/postclients</code> – ${E.verified} Patvirtinti nariai\n` +
        `<code>/rules</code> – ${E.rules} Grupės taisyklės\n` +
        `<code>/help</code> – ${E.help} Pagalba\n` +
        `<code>/mystats</code> – ${E.stats} Mano statistika\n` +
        `<code>/leaderboard</code> – ${E.trophy} Lyderių sąrašas`
    );
}

/**
 * Leaderboard message (HTML).
 * Shows top users ranked by points with medal emojis.
 */
export function buildLeaderboardMessage(
    rows: { user_id: bigint; username: string | null; points: number; weekly_points?: number }[]
): string {
    if (rows.length === 0) {
        return (
            `${E.stats} Šią savaitę lyderių dar nėra.\n\n` +
            `Pakviesk draugą ir pateksi į sąrašą!`
        );
    }
    const medals = [E.gold, E.silver, E.bronze];
    const lines = rows.map((r, i) => {
        const name = r.username ? `@${r.username}` : `User ${r.user_id}`;
        const medal = medals[i] ?? `${i + 1}.`;
        const pts = r.weekly_points ?? r.points;
        return `${medal} ${name} — ${pts} tšk`;
    });
    return (
        `${E.trophy} <b>TOP kvietėjai šią savaitę</b>\n\n` +
        lines.join("\n") +
        `\n\n${DIVIDER}\n` +
        `🎁 Top 3 gauna tokenus kiekvieną pirmadienį!`
    );
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
