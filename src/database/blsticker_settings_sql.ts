import { prisma } from "./index";

export async function get_blsticker_settings(chatId: string|number|bigint) {
    const cid = chatId.toString();
    return await prisma.blsticker_settings.findUnique({ where: { chat_id: cid } });
}

export async function set_blsticker_settings(chatId: string|number|bigint, blacklist_type: bigint, value: string) {
    try {
        const cid = chatId.toString();
        await prisma.blsticker_settings.upsert({
            where: { chat_id: cid },
            update: { blacklist_type, value },
            create: { chat_id: cid, blacklist_type, value }
        });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}