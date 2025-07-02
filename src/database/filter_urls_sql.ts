import { prisma } from "./index";

export async function get_filter_urls(chatId: string|number|bigint, keyword: string) {
    const cid = chatId.toString();
    return await prisma.filter_urls.findMany({
        where: { chat_id: cid, keyword },
        orderBy: { id: 'asc' }
    });
};

export async function set_filter_urls(chatId: string|number|bigint, keyword: string, name: string, url: string, sameLine: boolean) {
    try {
        const cid = chatId.toString();
        let existing = await prisma.filter_urls.findFirst({ where: { chat_id: cid, keyword, name } });

        if (existing) {
            await prisma.filter_urls.update({
                where: { id_chat_id_keyword: { id: existing.id, chat_id: cid, keyword } },
                data: { url, same_line: sameLine }
            });
        } else {
            await prisma.filter_urls.create({ data: { chat_id: cid, keyword, name, url, same_line: sameLine } });
        }
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}