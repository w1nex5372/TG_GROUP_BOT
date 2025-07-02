import { prisma } from "./index";

export async function get_blacklist(chatId: string | number | bigint) {
    const cid = chatId.toString();
    return await prisma.blacklist.findFirst({ where: { chat_id: cid } });
}

export async function get_all_blacklist(chatId: string | number | bigint) {
    const cid = chatId.toString();
    return await prisma.blacklist.findMany({ where: { chat_id: cid } });
}

export async function set_blacklist(chatId: string | number | bigint, trigger: string) {
    try {
        const cid = chatId.toString();
        return await prisma.blacklist.upsert({
            where: { chat_id_trigger: { chat_id: cid, trigger } },
            update: { trigger },
            create: { chat_id: cid, trigger }
        });
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function reset_blacklist(chatId: string | number | bigint, trigger: string) {
    try {
        const cid = chatId.toString();
        await prisma.blacklist.delete({
            where: {
                chat_id_trigger: {chat_id: cid, trigger: trigger}
             }
         })
         return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}

export async function reset_all_blacklist(chatId: string | number | bigint) {
    try {
        const cid = chatId.toString();
        await prisma.blacklist.deleteMany({
            where: {
                chat_id: cid
             }
         })
         return true;
    }
    catch (e) {
        console.error(e)
        return false;    
    }
}