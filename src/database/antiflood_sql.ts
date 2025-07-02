import { prisma } from "./index";

export async function get_flood(chatId: string) {
    return await prisma.antiflood.findFirst({ where: { chat_id: chatId } });
}

export async function set_flood(chat_id: string, count: bigint, limit: bigint) {
    try {
        await prisma.antiflood.upsert({
            where: { chat_id },
            update: { count, limit },
            create: { chat_id, count, limit }
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
        await prisma.antiflood.update({ where: { chat_id }, data: { count, user_id } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}