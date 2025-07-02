import { prisma } from "./index";

export async function get_blacklist(chatId: string) {
    return await prisma.blacklist.findFirst({ where: { chat_id: chatId } });
}

export async function get_all_blacklist(chatId: string) {
    return await prisma.blacklist.findMany({ where: { chat_id: chatId } });
}

export async function set_blacklist(chatId: string, trigger: string) {
    try {
        return await prisma.blacklist.upsert({
            where: { chat_id_trigger: { chat_id: chatId, trigger } },
            update: { trigger },
            create: { chat_id: chatId, trigger }
        });
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function reset_blacklist(chatId: string, trigger: string) {
    try {
        await prisma.blacklist.delete({
            where: {
                chat_id_trigger: {chat_id: chatId, trigger: trigger}
            }
        })
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}

export async function reset_all_blacklist(chatId: string) {
    try {
        await prisma.blacklist.deleteMany({
            where: {
                chat_id: chatId.toString()
            }
        })
        return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}