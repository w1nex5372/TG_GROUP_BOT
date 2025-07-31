import { prisma } from "./index";

export async function add_user_favorite(userId: bigint, animeId: string, animeTitle: string, animeImage?: string) {
    try {
        await prisma.$executeRaw`
            INSERT INTO user_favorites (user_id, anime_id, anime_title, anime_image, created_at)
            VALUES (${userId}, ${animeId}, ${animeTitle}, ${animeImage || ''}, NOW())
            ON CONFLICT (user_id, anime_id) DO NOTHING
        `;
        return true;
    } catch (error) {
        console.error('Error adding to favorites:', error);
        return false;
    }
}

export async function remove_user_favorite(userId: bigint, animeId: string) {
    try {
        await prisma.$executeRaw`
            DELETE FROM user_favorites 
            WHERE user_id = ${userId} AND anime_id = ${animeId}
        `;
        return true;
    } catch (error) {
        console.error('Error removing from favorites:', error);
        return false;
    }
}

export async function get_user_favorites(userId: bigint) {
    try {
        let favorites = await prisma.$queryRaw`
            SELECT anime_id, anime_title, anime_image 
            FROM user_favorites 
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
            LIMIT 20
        `;
        return Array.isArray(favorites) ? favorites : [];
    } catch (error) {
        console.error('Error fetching favorites:', error);
        return [];
    }
}

export async function set_user_character(userId: bigint, characterId: string, characterName: string, characterImage: string, type: 'waifu' | 'husbando') {
    try {
        await prisma.$executeRaw`
            INSERT INTO user_characters (user_id, character_id, character_name, character_image, type, created_at)
            VALUES (${userId}, ${characterId}, ${characterName}, ${characterImage || ''}, ${type}, NOW())
            ON CONFLICT (user_id, type) DO UPDATE SET 
                character_id = EXCLUDED.character_id,
                character_name = EXCLUDED.character_name,
                character_image = EXCLUDED.character_image,
                created_at = EXCLUDED.created_at
        `;
        return true;
    } catch (error) {
        console.error('Error setting character:', error);
        return false;
    }
}

export async function get_user_character(userId: bigint, type: 'waifu' | 'husbando') {
    try {
        let character = await prisma.$queryRaw`
            SELECT character_id, character_name, character_image, type
            FROM user_characters 
            WHERE user_id = ${userId} AND type = ${type}
            ORDER BY created_at DESC
            LIMIT 1
        `;
        return Array.isArray(character) && character.length > 0 ? character[0] : null;
    } catch (error) {
        console.error('Error fetching character:', error);
        return null;
    }
}
