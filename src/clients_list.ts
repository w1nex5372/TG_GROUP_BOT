import { Bot, Context, Composer, InlineKeyboard } from "grammy";
import * as fs from "fs";
import * as path from "path";
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

export function loadClients(): Client[] {
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

export function buildClientsKeyboard(clients: Client[]): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    for (const client of clients) {
        const username = client.username.replace(/^@/, "");
        keyboard.url(client.label, `https://t.me/${username}`).row();
    }
    return keyboard;
}

export function buildPayload(clients: Client[]): { text: string; keyboard: InlineKeyboard } {
    return {
        text: "✅ Patvirtinti nariai\n\nPaspausk mygtuką ir atsidarysi chatą:",
        keyboard: buildClientsKeyboard(clients),
    };
}

// ── Core post function (internal, takes raw api object) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postClients(api: any, targetChatId: number, deletePrevious: boolean): Promise<void> {
    const clients = loadClients();
    if (clients.length === 0) {
        console.log("[ClientsList] No clients to post.");
        return;
    }

    const state = loadState();
    const { text, keyboard } = buildPayload(clients);

    // Try to edit the existing message in place (keeps it in its original chat position)
    if (state.lastMessageId) {
        try {
            await api.editMessageText(targetChatId, state.lastMessageId, text, { reply_markup: keyboard });
            console.log(`[ClientsList] Edited message ${state.lastMessageId} in ${targetChatId}.`);
            return;
        } catch {
            // Message deleted or too old — fall through to send a new one
        }
    }

    const sent = await api.sendMessage(targetChatId, text, { reply_markup: keyboard });
    saveState({ lastMessageId: sent.message_id });
    console.log(`[ClientsList] Posted message ${sent.message_id} to ${targetChatId}.`);
}

// ── Scheduler ──────────────────────────────────────────────────────────────

let autoPostStarted = false;

export function startAutoPostClients<C extends Context>(bot: Bot<C>): void {
    const enabled = constants.AUTO_POSTCLIENTS_ENABLED === "true";
    const intervalMinutes = Number(constants.AUTO_POSTCLIENTS_INTERVAL_MINUTES || "15");
    const targetChatId = Number(constants.CLIENTS_TARGET_CHAT_ID);
    const deletePrevious = constants.CLIENTS_DELETE_PREVIOUS !== "false";
    const fireOnStart = constants.CLIENTS_FIRE_ON_START !== "false";

    console.log("[ClientsAuto] ENV:", { enabled, intervalMinutes, targetChatId, deletePrevious, fireOnStart });

    if (!enabled) {
        console.log("[ClientsAuto] Disabled by env");
        return;
    }

    if (autoPostStarted) {
        console.log("[ClientsAuto] Already started, skipping duplicate call.");
        return;
    }

    if (!targetChatId || !Number.isFinite(targetChatId)) {
        throw new Error("[ClientsAuto] CLIENTS_TARGET_CHAT_ID is required when AUTO_POSTCLIENTS_ENABLED=true");
    }

    if (intervalMinutes <= 0 || !Number.isFinite(intervalMinutes)) {
        throw new Error("[ClientsAuto] AUTO_POSTCLIENTS_INTERVAL_MINUTES must be a positive number");
    }

    autoPostStarted = true;
    ensureDataDir();

    let busy = false;

    const tick = async () => {
        console.log("[ClientsAuto] Tick");
        if (busy) {
            console.log("[ClientsAuto] Previous post still in progress, skipping.");
            return;
        }
        busy = true;
        try {
            await postClients(bot.api, targetChatId, deletePrevious);
        } catch (err) {
            console.error("[ClientsAuto] Failed to post clients:", err);
        } finally {
            busy = false;
        }
    };

    if (fireOnStart) {
        void tick();
    }

    setInterval(tick, intervalMinutes * 60 * 1000);

    console.log(
        `[ClientsAuto] Started. interval=${intervalMinutes} min, target=${targetChatId}` +
        (fireOnStart ? " (firing immediately on start)" : "")
    );
}

export const startClientsList = startAutoPostClients;

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
        await postClients(ctx.api, targetChatId, deletePrevious);
        await ctx.reply("✅ Clients list posted.", {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    } catch (err: any) {
        await ctx.reply(`❌ Failed to post: ${err?.message ?? err}`, {
            reply_parameters: { message_id: ctx.message.message_id },
        });
    }
}));

export default composer;
