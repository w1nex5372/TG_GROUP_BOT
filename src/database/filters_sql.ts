import { prisma } from "./index";

export async function get_filter(chatId: string, keyword: string) {
    return await prisma.filters.findFirst({ where: { chat_id: chatId, keyword } });
};

export async function set_filter(chatId: string, keyword: string, reply: string | null, msgtype: number, file: string | null) {
    try {
        await prisma.filters.upsert({
            where: { chat_id_keyword: { chat_id: chatId, keyword } },
            update: { reply, msgtype, file },
            create: { chat_id: chatId, keyword, reply, msgtype, file }
        });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function get_all_chat_filters(chatId: string) {
    return await prisma.filters.findMany({ where: { chat_id: chatId } });
}

export async function stop_filter(chatId: string, keyword: string) {
    try {
        await prisma.filters.delete({ where: { chat_id_keyword: { chat_id: chatId, keyword } } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function stop_all_chat_filters(chatId: string) {
    try {
        await prisma.filters.deleteMany({ where: { chat_id: chatId } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}