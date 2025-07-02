import { prisma } from "./index";

export async function get_filter(chatId: string|number|bigint, keyword: string) {
    const cid = chatId.toString();
    return await prisma.filters.findFirst({ where: { chat_id: cid, keyword } });
};

export async function set_filter(chatId: string|number|bigint, keyword: string, reply: string | null, msgtype: number, file: string | null) {
    try {
        const cid = chatId.toString();
        await prisma.filters.upsert({
            where: { chat_id_keyword: { chat_id: cid, keyword } },
            update: { reply, msgtype, file },
            create: { chat_id: cid, keyword, reply, msgtype, file }
        });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function get_all_chat_filters(chatId: string|number|bigint) {
    const cid = chatId.toString();
    return await prisma.filters.findMany({ where: { chat_id: cid } });
}

export async function stop_filter(chatId: string|number|bigint, keyword: string) {
    try {
        const cid = chatId.toString();
        await prisma.filters.delete({ where: { chat_id_keyword: { chat_id: cid, keyword } } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function stop_all_chat_filters(chatId: string|number|bigint) {
    try {
        const cid = chatId.toString();
        await prisma.filters.deleteMany({ where: { chat_id: cid } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}