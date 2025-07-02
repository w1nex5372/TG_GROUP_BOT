import { prisma } from "./index";

export async function get_chats_count() {
    let chats = await prisma.chats.count();
    return chats;
};


export async function get_chat(chat_id: string) {
    return await prisma.chats.findUnique({ where: { chat_id } });
};

export async function register_chat(chat_id: string, chat_name: string) {
    try {
        await prisma.chats.upsert({ where: { chat_id }, update: { chat_name }, create: { chat_id, chat_name } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
};