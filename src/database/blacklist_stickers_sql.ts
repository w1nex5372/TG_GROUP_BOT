import { prisma } from "./index";

export async function is_blsticker(chatId: string, trigger: string) {
    try {
        const blacklistedSticker = await prisma.blacklist_stickers.findUnique({
            where: {
                chat_id_trigger: {
                    chat_id: chatId,
                    trigger: trigger
                }
            }
        });
        return !!blacklistedSticker; // Returns true if the sticker is found, false otherwise
    } catch (e) {
        console.error("Error checking blacklisted sticker:", e);
        return false;
    }
}

export async function get_blsticker(chatId: string) {
    return await prisma.blacklist_stickers.findFirst({
        where: { chat_id: chatId }
    });
}

export async function get_all_blsticker(chatId: string) {
    return await prisma.blacklist_stickers.findMany({
        where: { chat_id: chatId }
    });
}

export async function set_blsticker(chatId: string, trigger: string) {
    try {
        return await prisma.blacklist_stickers.upsert({
            where: { chat_id_trigger: { chat_id: chatId, trigger } },
            update: { trigger },
            create: { chat_id: chatId, trigger }
        });
    }
    catch (e) {
        console.error(e)
        return false;
    }
}

export async function del_blsticker(chatId: string, trigger: string) {
    try {
        await prisma.blacklist_stickers.delete({ where: { chat_id_trigger: { chat_id: chatId, trigger } } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}

export async function del_all_blsticker(chatId: string) {
    try {
        await prisma.blacklist_stickers.deleteMany({ where: { chat_id: chatId } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}