import { prisma } from "./index";

export async function is_blsticker(chatId: string|number|bigint, trigger: string) {
    try {
        const cid = chatId.toString();
        const blacklistedSticker = await prisma.blacklist_stickers.findUnique({
            where: {
                chat_id_trigger: { chat_id: cid, trigger }
            }
        });
        return !!blacklistedSticker;
    } catch (e) {
        console.error("Error checking blacklisted sticker:", e);
        return false;
    }
}

export async function get_blsticker(chatId: string|number|bigint) {
    const cid = chatId.toString();
    return await prisma.blacklist_stickers.findFirst({ where: { chat_id: cid } });
}

export async function get_all_blsticker(chatId: string|number|bigint) {
    const cid = chatId.toString();
    return await prisma.blacklist_stickers.findMany({ where: { chat_id: cid } });
}

export async function set_blsticker(chatId: string|number|bigint, trigger: string) {
    try {
        const cid = chatId.toString();
        return await prisma.blacklist_stickers.upsert({
            where: { chat_id_trigger: { chat_id: cid, trigger } },
            update: { trigger },
            create: { chat_id: cid, trigger }
        });
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function del_blsticker(chatId: string|number|bigint, trigger: string) {
    try {
        const cid = chatId.toString();
        await prisma.blacklist_stickers.delete({ where: { chat_id_trigger: { chat_id: cid, trigger } } });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function del_all_blsticker(chatId: string|number|bigint) {
    try {
        const cid = chatId.toString();
        await prisma.blacklist_stickers.deleteMany({ where: { chat_id: cid } });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}