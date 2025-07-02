import { prisma } from "./index";

export async function get_clean_bluetext(chatId: string) {
    return await prisma.cleaner_bluetext_chat_setting.findUnique({ where: { chat_id: chatId } });
}

export async function set_clean_bluetext(chatId: string, cleanBluetext: boolean) {
    try {
        await prisma.cleaner_bluetext_chat_setting.upsert({ where: { chat_id: chatId }, update: { is_enable: cleanBluetext }, create: { chat_id: chatId, is_enable: cleanBluetext } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;
    }
}