import { bot, adapter }from "./bot";
import constants from "./config"
import fs from 'fs';
import { gramjs, stringSession, sessionFilePath } from './utility';
import { logger, channel_log } from "./logger"
import { Context } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { autoRetry } from "@grammyjs/auto-retry";
import { chatMembers } from "@grammyjs/chat-members";
import { hydrateFiles } from '@grammyjs/files';
import { LogLevel } from 'telegram/extensions/Logger';

import modules from "./modules/index";
import { startAdsRotator } from "./ads_rotator";
import { startAutoPostClients } from "./clients_list";

const runner = run(bot, { 
    runner: { 
        fetch: { 
            allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member"] 
        } 
    } 
});
const constraints = (ctx: Context) => [String(ctx.chat?.id), String(ctx.from?.id)]

bot.api.config.use(autoRetry({
    maxRetryAttempts: 1, 
    maxDelaySeconds: 5, 
}));
bot.use(sequentialize(constraints))
bot.use(chatMembers(adapter, { 
    enableAggressiveStorage: true, 
    enableCaching: true, 
    keepLeftChatMembers: true 
}));
bot.api.config.use(hydrateFiles(bot.token));

bot.use(modules);

(async function () {
    try {
         await bot.api.deleteWebhook({ drop_pending_updates: true });
         await gramjs.setLogLevel(LogLevel.NONE)
         await gramjs.start({botAuthToken: constants.BOT_TOKEN});  
         
         try {
             const newSession = stringSession.save();
             let oldSession = "";
             if (fs.existsSync(sessionFilePath)) {
                 oldSession = fs.readFileSync(sessionFilePath, 'utf8').trim();
             }
             if (newSession !== oldSession) {
                 fs.writeFileSync(sessionFilePath, newSession, 'utf8');
                 console.log(`🔐 GramJS session saved to ${sessionFilePath}`);
             } else {
                 console.log(`ℹ️ GramJS session unchanged; not rewriting ${sessionFilePath}`);
             }
         } catch (e) {
             console.error("Failed to update session file:", e);
         }
    } catch (e) {
        console.error("Startup error:", e);
    }
})();

bot.init().then(async() => {
    let currentTime = new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
    let bot_info = (
        `${bot.botInfo.first_name}\n` + 
        `\#LAUNCHED on ${currentTime}, ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}\n\n` +
        `• Username: @${bot.botInfo.username}\n` +
        `• Bot ID: ${bot.botInfo.id}\n` +
        `• Allow Groups: ${bot.botInfo.can_join_groups ? `Enabled` : `Disabled`}\n` +
        `• Privacy Mode: ${bot.botInfo.can_read_all_group_messages ? `Disabled` : `Enabled`}\n` +
        `• Inline Mode: ${bot.botInfo.supports_inline_queries ? `Enabled` : `Disabled`}\n\n`
    );
    console.log(bot_info);
    channel_log(bot_info);
    startAdsRotator(bot);
    startAutoPostClients(bot);
});

async function exitSignal(signal: String) {
    runner.isRunning() && runner.stop();
    logger.info(`${signal} - Exiting...`);
}

process.once('SIGINT', () => {
    exitSignal('SIGINT');
});
process.once('SIGTERM', () => {
    exitSignal('SIGTERM');
});