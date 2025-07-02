import { prisma } from "./index";

export async function get_blsticker_settings(chatId: string) {
    return await prisma.blsticker_settings.findUnique({ where: { chat_id: chatId } });
}

export async function set_blsticker_settings(chatId: string, blacklist_type: bigint, value: string) {
    try {
        await prisma.blsticker_settings.upsert({
            where: { chat_id: chatId },
            update: { blacklist_type, value },
            create: { chat_id: chatId, blacklist_type, value }
        });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}