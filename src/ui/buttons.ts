import { InlineKeyboard } from "grammy";
import { E } from "./emoji";

/**
 * Main DM guide menu keyboard.
 *
 * Layout:
 *   [ 👥 Grupė ]            [ 📜 Taisyklės       ]
 *   [ 🆘 Pagalba ]          [ ℹ️ Komandos         ]
 *   [ 🏆 Leaderboard ]      [ 📊 Mano statistika  ]
 *   [ 📣 Pakviesti draugą                         ]
 *   [ ✅ Patvirtinti nariai                       ]
 */
export function buildMainMenu(inviteUrl: string): InlineKeyboard {
    return new InlineKeyboard()
        .url(`${E.spinwar} Žaisti SpinWar`, "https://t.me/Testukas999Bot")
        .url(`${E.shop} Parduotuvė`, "https://t.me/SpinWarPlayBot").row()
        .text(`${E.stats} Mano balansas`, "guide:balance")
        .text(`${E.trophy} Leaderboard`, "guide:leaderboard").row()
        .text(`${E.invite} Pakviesti draugą`, "guide:invite").row()
        .url(`${E.group} Grupė`, inviteUrl)
        .url(`${E.help} Pagalba`, "https://t.me/Bishopas777").row()
        .text(`📖 Kaip tai veikia?`, "guide:howto");
}

/** Single "⬅️ Atgal" back button. */
export function buildBackRow(): InlineKeyboard {
    return new InlineKeyboard().text(`${E.back} Atgal`, "guide:menu");
}

/**
 * Invite share keyboard:
 *   [ 📤 Dalintis ]
 *   [ 👥 Prisijungti prie grupės ]  ← only if inviteUrl is set
 *   [ ⬅️ Atgal ]
 */
export function buildInviteKeyboard(shareUrl: string, inviteUrl: string): InlineKeyboard {
    const kb = new InlineKeyboard()
        .url(`${E.share} Dalintis`, shareUrl).row();
    if (inviteUrl) {
        kb.url(`${E.group} Prisijungti prie grupės`, inviteUrl).row();
    }
    return kb.text(`${E.back} Atgal`, "guide:menu");
}
