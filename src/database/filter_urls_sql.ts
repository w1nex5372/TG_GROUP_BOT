import { prisma } from "./index";

export async function get_filter_urls(chatId: string, keyword: string) {
    return await prisma.filter_urls.findMany({
        where: { chat_id: chatId, keyword },
        orderBy: { id: 'asc' }
    });
};

export async function set_filter_urls(chatId: string, keyword: string, name: string, url: string, sameLine: boolean) {
    try {
        let existing = await prisma.filter_urls.findFirst({ where: { chat_id: chatId, keyword, name } });

        if (existing) {
            await prisma.filter_urls.update({
                where: { id_chat_id_keyword: { id: existing.id, chat_id: chatId, keyword } },
                data: { url, same_line: sameLine }
            });
        } else {
            await prisma.filter_urls.create({ data: { chat_id: chatId, keyword, name, url, same_line: sameLine } });
        }
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}