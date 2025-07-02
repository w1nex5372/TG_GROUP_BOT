import { prisma } from "./index";

export async function get_chats_count() {
    let chats = await prisma.chats.count();
    return chats;
};


export async function get_chat(chat_id: string|number|bigint) {
    const cid = chat_id.toString();
    return await prisma.chats.findUnique({ where: { chat_id: cid } });
};

export async function register_chat(chat_id: string|number|bigint, chat_name: string) {
    try {
        const cid = chat_id.toString();
        await prisma.chats.upsert({ where: { chat_id: cid }, update: { chat_name }, create: { chat_id: cid, chat_name } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
};