import { prisma } from "./index";

export async function get_note(chatId: string, name: string) {
    return await prisma.notes.findFirst({ where: { chat_id: chatId, name } });
};

export async function save_note(chatId: string, name: string, value: string | null, msgtype: number, file: string | null) {
    try {
        await prisma.notes.upsert({
            where: { chat_id_name: { chat_id: chatId, name } },
            update: { value, msgtype, file },
            create: { chat_id: chatId, name, value, msgtype, file, is_reply: false, has_buttons: false }
        });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function get_all_chat_notes(chatId: string) {
    return await prisma.notes.findMany({ where: { chat_id: chatId } });
}

export async function clear_note(chatId: string, name: string) {
    try {
        await prisma.notes.delete({ where: { chat_id_name: { chat_id: chatId, name } } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}

export async function remove_all_chat_notes(chatId: string) {
    try {
        await prisma.notes.deleteMany({ where: { chat_id: chatId } });
        return true;
    }
    catch (e) {
        console.error(e);
        return false;
    }
}