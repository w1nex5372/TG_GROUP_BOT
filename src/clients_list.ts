import { Bot, Context, Composer, InlineKeyboard } from "grammy";
import * as fs from "fs";
import * as path from "path";
import IORedis from "ioredis";
import { superusersOnly } from "./helpers/helper_func";
import constants from "./config";

/**
 * Clients list scheduler.
 * Example setup:
 * CLIENTS_ENABLED=true
 * CLIENTS_TARGET_CHAT_ID=-1003846193977
 * CLIENTS_REPOST_HOURS=2
 * CLIENTS_DELETE_PREVIOUS=true
 * CLIENTS_FIRE_ON_START=true
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface Client {
    label: string;
    username: string; // stored without leading @
}

interface ClientsState {
    lastMessageId: number | null;
}

// ── File paths ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "../data");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const STATE_FILE = path.join(DATA_DIR, "clients_state.json");

// ── File helpers ───────────────────────────────────────────────────────────

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadClients(): Client[] {
    try {
        return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8"));
    } catch {
        return [];
    }
}

function saveClients(clients: Client[]): void {
    ensureDataDir();
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2), "utf8");
}

function loadState(): ClientsState {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return { lastMessageId: null };
    }
}

function saveState(state: ClientsState): void {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ── Message builder ────────────────────────────────────────────────────────

function buildPayload(clients: Client[]): { text: string; keyboard: InlineKeyboard } {
    const text = "✅ PATVIRTINTI NARIAI\nPaspausk mygtuką ir atidarysi chatą:";
    const keyboard = new InlineKeyboard();
    for (const client of clients) {
        const username = client.username.replace(/^@/, "");
        keyboard.url(client.label, `https://t.me/${username}`).row();
    }
    return { text, keyboard };
}

export function buildClientsKeyboard(): InlineKeyboard {
    const clients = loadClients();
    return buildPayload(clients).keyboard;
}

// ── Core post function (internal, takes raw api object) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postClientsToTarget(
    api: any,
    targetChatId: number,
    deletePrevious: boolean
): Promise<void> {
    const clients = loadClients();
    if (clients.length === 0) {
        console.log("[ClientsList] No clients to post.");
        return;
    }

    const state = loadState();

    if (deletePrevious && state.lastMessageId) {
        try {
            await api.deleteMessage(targetChatId, state.lastMessageId);
        } catch {
            // Ignore: message may already be deleted or too old
        }
    }

    const { text, keyboard } = buildPayload(clients);
    const sent = await api.sendMessage(targetChatId, text, { reply_markup: keyboard });

    saveState({ lastMessageId: sent.message_id });
    console.log(`[ClientsList] Posted message ${sent.message_id} to ${targetChatId}.`);
}

// ── Scheduler ──────────────────────────────────────────────────────────────

export function startClientsList<C extends Context>(bot: Bot<C>): void {
    const enabled = constants.CLIENTS_ENABLED === "true";
    if (!enabled) return;

    const targetChatId = Number(constants.CLIENTS_TARGET_CHAT_ID);
    const repostHours = Number(constants.CLIENTS_REPOST_HOURS || "2");
    const deletePrevious = constants.CLIENTS_DELETE_PREVIOUS !== "false";
    const fireOnStart = constants.CLIENTS_FIRE_ON_START !== "false"; // default true

    if (!targetChatId) {
        console.error(
            "[ClientsList] CLIENTS_ENABLED=true but CLIENTS_TARGET_CHAT_ID is missing. Disabled."
        );
        return;
    }

    if (repostHours <= 0 || !Number.isFinite(repostHours)) {
        console.error("[ClientsList] CLIENTS_REPOST_HOURS must be a positive number. Disabled.");
        return;
    }

    ensureDataDir();

    let busy = false;

    const run = async () => {
        if (busy) {
            console.log("[ClientsList] Previous post still in progress, skipping.");
            return;
        }
        busy = true;
        try {
            await postClientsToTarget(bot.api, targetChatId, deletePrevious);
        } catch (err) {
            console.error("[ClientsList] Failed to post clients:", err);
        } finally {
            busy = false;
        }
    };

    if (fireOnStart) {
        run();
    }

    setInterval(run, repostHours * 60 * 60 * 1000);

    console.log(
        `[ClientsList] Started. Posting to ${targetChatId} every ${repostHours}h.` +
        (fireOnStart ? " (firing immediately on start)" : "")
    );
}

// ── Admin commands Composer ────────────────────────────────────────────────

const composer = new Composer();

// /addclient <label> <@username>
composer.command("addclient", superusersOnly(async (ctx: any) => {
    const args = (ctx.match as string)?.trim();
    if (!args) {
        return ctx.reply("Usage: /addclient <label> <@username>", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }

    const parts = args.split(/\s+/);
    if (parts.length < 2) {
        return ctx.reply("Usage: /addclient <label> <@username>", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }

    const username = parts[parts.length - 1].replace(/^@/, "");
    const label = parts.slice(0, -1).join(" ");

    const clients = loadClients();
    const idx = clients.findIndex(
        (c) => c.username.toLowerCase() === username.toLowerCase()
    );
    if (idx >= 0) {
        clients[idx] = { label, username };
    } else {
        clients.push({ label, username });
    }
    saveClients(clients);

    await ctx.reply(`✅ Client saved: ${label} (@${username})`, {
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

// /delclient <@username>
composer.command("delclient", superusersOnly(async (ctx: any) => {
    const arg = (ctx.match as string)?.trim().replace(/^@/, "");
    if (!arg) {
        return ctx.reply("Usage: /delclient <@username>", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }

    const clients = loadClients();
    const filtered = clients.filter(
        (c) => c.username.toLowerCase() !== arg.toLowerCase()
    );

    if (filtered.length === clients.length) {
        return ctx.reply(`❌ Client @${arg} not found.`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }

    saveClients(filtered);
    await ctx.reply(`✅ Client @${arg} removed.`, {
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

// /clients — list all clients
composer.command("clients", superusersOnly(async (ctx: any) => {
    const clients = loadClients();
    if (clients.length === 0) {
        return ctx.reply("No clients in the list.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
    const list = clients
        .map((c, i) => `${i + 1}. ${c.label} — @${c.username}`)
        .join("\n");
    await ctx.reply(`📋 Clients list:\n\n${list}`, {
        reply_parameters: { message_id: ctx.message.message_id },
    });
}));

// /postclients — post immediately to target group
composer.command("postclients", superusersOnly(async (ctx: any) => {
    const targetChatId = Number(constants.CLIENTS_TARGET_CHAT_ID);
    const deletePrevious = constants.CLIENTS_DELETE_PREVIOUS !== "false";

    if (!targetChatId) {
        return ctx.reply("❌ CLIENTS_TARGET_CHAT_ID is not configured.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }

    try {
        await postClientsToTarget(ctx.api, targetChatId, deletePrevious);
        await ctx.reply("✅ Clients list posted.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    } catch (err: any) {
        await ctx.reply(`❌ Failed to post: ${err?.message ?? err}`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
}));

let autoPostClientsSchedulerStarted = false;

export function startAutoPostClients<C extends Context>(bot: Bot<C>): void {
    if (autoPostClientsSchedulerStarted) {
        console.log("[AutoPostClients] Scheduler already started in this process, skipping.");
        return;
    }

    const enabled = constants.AUTO_POSTCLIENTS_ENABLED === "true";
    if (!enabled) return;

    const targetChatId = Number(constants.CLIENTS_TARGET_CHAT_ID);
    const intervalMinutes = Number(constants.AUTO_POSTCLIENTS_INTERVAL_MINUTES || "15");
    const deletePrevious = constants.CLIENTS_DELETE_PREVIOUS !== "false";

    if (!targetChatId) {
        console.error(
            "[AutoPostClients] AUTO_POSTCLIENTS_ENABLED=true but CLIENTS_TARGET_CHAT_ID is missing. Disabled."
        );
        return;
    }

    if (intervalMinutes <= 0 || !Number.isFinite(intervalMinutes)) {
        console.error("[AutoPostClients] AUTO_POSTCLIENTS_INTERVAL_MINUTES must be a positive number. Disabled.");
        return;
    }

    autoPostClientsSchedulerStarted = true;

    const lockTtlMs = Math.max(30_000, Math.floor(intervalMinutes * 60 * 1000 * 0.9));
    const redisLockKey = "autopostclients:lock";
    let redis: IORedis | null = null;

    try {
        redis = new IORedis(constants.REDIS_CACHE_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    } catch (err) {
        console.warn("[AutoPostClients] Redis client initialization failed, running without distributed lock:", err);
    }

    let busy = false;

    const run = async () => {
        if (busy) {
            console.log("[AutoPostClients] Previous run still in progress, skipping.");
            return;
        }

        busy = true;
        let lockValue: string | null = null;
        let hasDistributedLock = false;

        try {
            if (redis) {
                try {
                    if (redis.status !== "ready") {
                        await redis.connect();
                    }

                    lockValue = `${process.pid}:${Date.now()}`;
                    const acquired = await redis.set(redisLockKey, lockValue, "PX", lockTtlMs, "NX");
                    if (acquired !== "OK") {
                        console.log("[AutoPostClients] Lock already held by another instance, skipping.");
                        return;
                    }
                    hasDistributedLock = true;
                } catch (err) {
                    console.warn("[AutoPostClients] Redis lock unavailable; continuing with single-process guard:", err);
                }
            }

            await postClientsToTarget(bot.api, targetChatId, deletePrevious);
        } catch (err) {
            console.error("[AutoPostClients] Failed to auto-post clients:", err);
        } finally {
            if (redis && hasDistributedLock && lockValue) {
                try {
                    const current = await redis.get(redisLockKey);
                    if (current === lockValue) {
                        await redis.del(redisLockKey);
                    }
                } catch (err) {
                    console.warn("[AutoPostClients] Failed to release Redis lock:", err);
                }
            }
            busy = false;
        }
    };

    setInterval(run, intervalMinutes * 60 * 1000);
    run();

    console.log(
        `[AutoPostClients] Started. Posting to ${targetChatId} every ${intervalMinutes} minute(s).`
    );
}

export default composer;
