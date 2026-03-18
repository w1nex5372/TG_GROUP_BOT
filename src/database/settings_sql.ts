import { prisma } from "./index";
import constants from "../config";

export async function getSetting(key: string): Promise<string | null> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
    });
}

const DEFAULT_GROUP_INVITE_URL = "https://t.me/+cQKeKeWmK3I4M2Rk";

/** Returns DB setting "group_invite_url", falling back to GROUP_INVITE_URL env, then hardcoded default. */
export async function getGroupInviteUrl(): Promise<string> {
    const dbVal = await getSetting("group_invite_url");
    if (dbVal) return dbVal;
    return constants.GROUP_INVITE_URL || DEFAULT_GROUP_INVITE_URL;
}
