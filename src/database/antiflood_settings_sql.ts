import { prisma } from "./index";

export async function get_flood_settings(chatId: string|number|bigint) {
    const cid = chatId.toString();
    return await prisma.antiflood_settings.findUnique({ where: { chat_id: cid } });
}

export async function set_flood_settings(chat_id: string|number|bigint, flood_type: bigint, value: string = "0") {
    try {
        const cid = chat_id.toString();
        await prisma.antiflood_settings.upsert({
            where: { chat_id: cid },
            update: { flood_type, value },
            create: { chat_id: cid, flood_type, value }
        });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;
    }
}