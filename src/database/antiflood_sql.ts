import { prisma } from "./index";

export async function get_flood(chatId: string | number | bigint) {
    const cid = chatId.toString();
    return await prisma.antiflood.findFirst({ where: { chat_id: cid } });
}

export async function set_flood(chat_id: string, count: bigint, limit: bigint) {
    try {
        await prisma.antiflood.upsert({
            where: { chat_id: chat_id.toString() },
            update: { count, limit },
            create: { chat_id: chat_id.toString(), count, limit }
        });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}

export async function update_flood(chat_id: string, count: bigint, user_id: number | null) {
    try {
        await prisma.antiflood.update({ where: { chat_id: chat_id.toString() }, data: { count, user_id } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}