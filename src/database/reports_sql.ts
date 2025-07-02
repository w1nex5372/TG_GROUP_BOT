import { prisma } from "./index";

export async function get_report_settings(chatId: string) {
    return await prisma.chat_report_settings.findUnique({ where: { chat_id: chatId } });
}

export async function set_report_settings(chatId: string, shouldReport: boolean) {
    try {
        await prisma.chat_report_settings.upsert({ where: { chat_id: chatId }, update: { should_report: shouldReport }, create: { chat_id: chatId, should_report: true } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;
    }
}