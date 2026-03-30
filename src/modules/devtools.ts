import { Composer, InlineKeyboard } from "grammy";
import { superusersOnly } from "../helpers/helper_func";
import { grammyErrorLog } from "../logger";
import { get_all_users } from "../database/users_sql";
import { runWeeklyRewards } from "../services/weekly_rewards";
import { prisma } from "../database/index";
import { addPoints, buildStatsText, resetWeeklyPoints } from "../database/referrals_sql";

const composer = new Composer();

composer.chatType(["supergroup", "group", "private"]).command("snipe", superusersOnly(async (ctx: any) => {
    let args = ctx.match;
    let split_args = args.split(" ");
    let chat_id = split_args[0];
    let text = split_args.slice(1).join(" ");

    if (chat_id && text) {
        await ctx.api.sendMessage(chat_id, text, {parse_mode: "HTML"})
        .then(() => {
            ctx.reply(`Succcc-cess!`, {reply_parameters: {message_id: ctx.message.message_id}, parse_mode: "HTML"});   
        })
        .catch((GrammyError: any) => {
            ctx.reply("Lmao error. Check logs dawg.");
            grammyErrorLog(ctx, GrammyError);
        })
    }
}));

const keyboard = new InlineKeyboard()
.text("Cancel Broadcast", "cancel_broadcast");

composer.command("broadcast", superusersOnly(async (ctx: any) => {
    let RATE_LIMIT = 5; // messages per second
    let STATUS_UPDATE_INTERVAL = 5000; // 5 seconds

    let message = ctx.match;
    if (!message) {
        await ctx.reply("Please provide a message to broadcast.");
        return;
    }

    let users = await get_all_users();
    let success_count = 0;
    let fail_count = 0;
    let last_status_update = 0;
    
    let status_message = await ctx.reply(
        `Broadcasting to <code>${users.length}</code> users. This may take a while...`,
        { reply_markup: keyboard, parse_mode: "HTML" }
    );

    let update_status = async (force = false) => {
        let now = Date.now();
        if (force || now - last_status_update >= STATUS_UPDATE_INTERVAL) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                status_message.message_id,
                `Broadcasting: ${success_count + fail_count}/${users.length}\nSuccess: ${success_count}\nFailed: ${fail_count}`,
                { reply_markup: keyboard }
            );
            last_status_update = now;
        }
    };

    let broadcast_queue = async () => {
        let batch_size = Math.min(RATE_LIMIT, users.length);
        let batch = users.splice(0, batch_size);
        let batch_start = Date.now();

        for (let user_id of batch) {
            try {
                await ctx.api.sendMessage(user_id, message);
                success_count++;
            } catch (error) {
                console.error(`Failed to send message to user ${user_id}:`, error);
                fail_count++;
            }

        await update_status();

        let batch_duration = Date.now() - batch_start;
        let delay_before_next_batch = Math.max(0, 1000 - batch_duration);

        if (users.length > 0) {
            setTimeout(broadcast_queue, delay_before_next_batch);
        } else {
            await update_status(true);
            await ctx.api.editMessageText(
                ctx.chat!.id,
                status_message.message_id,
                `Broadcast complete.\nSuccess: ${success_count}\nFailed: ${fail_count}`
            );
        }
    };

    broadcast_queue();
}
}));


// ── /testweekly — manually trigger weekly reward distribution ─────────────────

composer.command("testweekly", superusersOnly(async (ctx: any) => {
    await ctx.reply("⏳ Paleidžiu savaitės apdovanojimus...", {
        reply_parameters: { message_id: ctx.message.message_id },
    });
    try {
        await runWeeklyRewards();
        await ctx.reply("✅ Savaitės apdovanojimai išdalinti.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    } catch (err: any) {
        await ctx.reply(`❌ Klaida: ${err?.message ?? err}`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
}));

// ── /weeklyresults — show last week's winners from history ────────────────────

composer.command("weeklyresults", superusersOnly(async (ctx: any) => {
    const rows = await prisma.$queryRaw<{
        user_id: bigint; username: string | null; place: number;
        weekly_points: number; tokens_awarded: number; week_start: Date;
    }[]>`
        SELECT user_id, username, place, weekly_points, tokens_awarded, week_start
        FROM   weekly_winners
        ORDER  BY week_start DESC, place ASC
        LIMIT  9
    `;

    if (rows.length === 0) {
        await ctx.reply("Dar nėra jokių savaitės rezultatų.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    let text = "📋 <b>Paskutiniai savaitės nugalėtojai</b>\n\n";
    let lastWeek = "";

    for (const r of rows) {
        const weekStr = r.week_start.toISOString().slice(0, 10);
        if (weekStr !== lastWeek) {
            text += `\n📅 <b>Savaitė nuo ${weekStr}</b>\n`;
            lastWeek = weekStr;
        }
        const name = r.username ? `@${r.username}` : `#${r.user_id}`;
        text += `${medals[r.place - 1] ?? r.place + "."} ${name} — ${r.weekly_points} tšk → +${r.tokens_awarded} tokenų\n`;
    }

    await ctx.reply(text, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

// ── /addpoints <user_id> <amount> — manually add points to a user ─────────────

composer.command("addpoints", superusersOnly(async (ctx: any) => {
    const args = (ctx.match as string).trim().split(/\s+/);
    if (args.length < 2 || !/^\d+$/.test(args[0]) || !/^-?\d+$/.test(args[1])) {
        await ctx.reply("Naudojimas: /addpoints <user_id> <amount>\nPavyzdys: /addpoints 123456789 10", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }
    const userId = BigInt(args[0]);
    const amount = parseInt(args[1], 10);

    try {
        await addPoints(userId, amount);
        await ctx.reply(`✅ Vartotojui <code>${args[0]}</code> pridėta ${amount > 0 ? "+" : ""}${amount} taškų.`, {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message.message_id },
        });
    } catch (err: any) {
        await ctx.reply(`❌ Klaida: ${err?.message ?? err}`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
}));

// ── /userstats <user_id> — check any user's stats ────────────────────────────

composer.command("userstats", superusersOnly(async (ctx: any) => {
    const arg = (ctx.match as string).trim();
    if (!arg || !/^\d+$/.test(arg)) {
        await ctx.reply("Naudojimas: /userstats <user_id>", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
    }
    try {
        const text = await buildStatsText(BigInt(arg));
        await ctx.reply(`👤 Vartotojas <code>${arg}</code>\n\n${text}`, {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message.message_id },
        });
    } catch (err: any) {
        await ctx.reply(`❌ Klaida: ${err?.message ?? err}`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
}));

// ── /resetweekly — force reset all weekly_points (without awarding) ───────────

composer.command("resetweekly", superusersOnly(async (ctx: any) => {
    const count = await resetWeeklyPoints();
    await ctx.reply(`♻️ weekly_points atstatyti ${count} vartotojų.`, {
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

// ── /adminhelp — list all admin commands ─────────────────────────────────────

composer.command("adminhelp", superusersOnly(async (ctx: any) => {
    const text =
        `🛠 <b>Admin komandos</b>\n\n` +

        `<b>── Nariai ──</b>\n` +
        `<code>/addclient [label] [@username]</code> — pridėti patvirtintą narį\n` +
        `<code>/delclient [@username]</code> — pašalinti narį\n` +
        `<code>/clients</code> — sąrašas visų narių\n` +
        `<code>/postclients</code> — išsiųsti sąrašą į grupę\n\n` +

        `<b>── Referral sistema ──</b>\n` +
        `<code>/debugref [user_id]</code> — patikrinti userio ref būseną\n` +
        `<code>/resetref [user_id]</code> — pilnas ref/taškų reset useriui\n` +
        `<code>/addpoints [user_id] [n]</code> — pridėti/atimti taškų rankiniu būdu\n` +
        `<code>/userstats [user_id]</code> — peržiūrėti bet kurio userio statistiką\n` +
        `<code>/setgroupurl [url]</code> — nustatyti grupės pakvietimo nuorodą\n\n` +

        `<b>── Savaitiniai prizai ──</b>\n` +
        `<code>/testweekly</code> — paleisti savaitės apdovanojimus dabar\n` +
        `<code>/weeklyresults</code> — peržiūrėti paskutinius nugalėtojus\n` +
        `<code>/resetweekly</code> — atstatyti savaitinius taškus (be prizų)\n\n` +

        `<b>── Skelbimai ──</b>\n` +
        `<code>/adsstatus</code> — reklamos rotacijos statusas\n` +
        `<code>/adqueue</code> — reklamos eilė\n` +
        `<code>/createad</code> — sukurti naują reklamą\n\n` +

        `<b>── Sisteminės ──</b>\n` +
        `<code>/broadcast [tekstas]</code> — žinutė visiems vartotojams\n` +
        `<code>/snipe [chat_id] [tekstas]</code> — siųsti į bet kurį chatą\n` +
        `<code>/sysinfo</code> — serverio informacija\n` +
        `<code>/ping</code> — boto ping`;

    await ctx.reply(text, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

composer.chatType("private").command("getfileid", superusersOnly(async (ctx: any) => {
    await ctx.reply("Siųsk nuotrauką su caption <code>/getfileid</code>.", { parse_mode: "HTML" });
}));

composer.chatType("private").on("message:photo", superusersOnly(async (ctx: any, next: () => Promise<void>) => {
    if (!ctx.message.caption?.startsWith("/getfileid")) return next();
    const largest = ctx.message.photo[ctx.message.photo.length - 1];
    await ctx.reply(`📷 Photo file_id:\n<code>${largest.file_id}</code>`, { parse_mode: "HTML" });
}));

composer.chatType("private").on("message:document", superusersOnly(async (ctx: any, next: () => Promise<void>) => {
    if (!ctx.message.caption?.startsWith("/getfileid")) return next();
    await ctx.reply(`📄 Document file_id:\n<code>${ctx.message.document.file_id}</code>`, { parse_mode: "HTML" });
}));

export default composer;