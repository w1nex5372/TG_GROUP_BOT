import { prisma } from "./index";

export async function get_clean_service(chatId: string) {
    return await prisma.clean_service.findUnique({ where: { chat_id: chatId } });
}

export async function set_clean_service(chatId: string, cleanService: boolean) {
    try {
        await prisma.clean_service.upsert({ where: { chat_id: chatId }, update: { clean_service: cleanService }, create: { chat_id: chatId, clean_service: cleanService } });
        return true;
    }
    catch (e) {
        console.error(e)
        return false;
    }
}