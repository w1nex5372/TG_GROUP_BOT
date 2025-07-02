import { prisma } from "./index";

export async function get_blacklist_settings(chatId: string | number | bigint) {
    const cid = chatId.toString();
    return await prisma.blacklist_settings.findUnique({ where: { chat_id: cid } });
}

export async function set_blacklist_settings(chatId: string | number | bigint, blacklist_type: bigint, value: string) {
    try {
        const cid = chatId.toString();
        await prisma.blacklist_settings.upsert({
            where: { chat_id: cid },
            update: { blacklist_type, value },
            create: { chat_id: cid, blacklist_type, value }
        });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}