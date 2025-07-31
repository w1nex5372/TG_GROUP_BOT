import { Composer, InlineKeyboard } from "grammy";
import axios from "axios";
import { add_user_favorite, remove_user_favorite, get_user_favorites, set_user_character, get_user_character } from "../database/anilist_sql";

const composer = new Composer();

const API_URL = 'https://graphql.anilist.co';

function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function cleanDescription(description: string | null): string {
    if (!description) return 'No description available';
    let cleaned = description.replace(/<br><br>/g, '\n').replace(/<[^>]*>/g, '');
    if (cleaned.length > 400) {
        cleaned = cleaned.substring(0, 400) + '...';
    }
    return escapeMarkdownV2(cleaned);
}

async function fetchAnimeDetails(animeName: string) {
    let query = `
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                id
                title {
                    romaji
                    english
                    native
                }
                description
                siteUrl
                coverImage {
                    extraLarge
                    large
                    medium
                }
                bannerImage
                episodes
                status
                genres
                averageScore
                format
                season
                seasonYear
            }
        }
    `;

    let variables = {
        search: animeName
    };

    try {
        let response = await axios.post(API_URL, { query, variables });
        return response.data.data.Media;
    } catch (error) {
        console.error('Error fetching anime details:', error);
        return null;
    }
}

async function fetchMangaDetails(mangaName: string) {
    let query = `
        query ($search: String) {
            Media(search: $search, type: MANGA) {
                id
                title {
                    romaji
                    english
                    native
                }
                description
                siteUrl
                coverImage {
                    extraLarge
                    large
                    medium
                }
                bannerImage
                chapters
                volumes
                status
                genres
                averageScore
                format
            }
        }
    `;

    let variables = {
        search: mangaName
    };

    try {
        let response = await axios.post(API_URL, { query, variables });
        return response.data.data.Media;
    } catch (error) {
        console.error('Error fetching manga details:', error);
        return null;
    }
}

async function fetchCharacterDetails(characterName: string) {
    let query = `
        query ($search: String) {
            Character(search: $search) {
                id
                name {
                    full
                    native
                }
                description
                siteUrl
                image {
                    large
                }
                gender
                age
                dateOfBirth {
                    year
                    month
                    day
                }
            }
        }
    `;

    let variables = {
        search: characterName
    };

    try {
        let response = await axios.post(API_URL, { query, variables });
        return response.data.data.Character;
    } catch (error) {
        console.error('Error fetching character details:', error);
        return null;
    }
}

async function fetchTopAnime(genres: string[], tags: string[], page: number = 1) {
    let query = `
        query ($genres: [String], $tags: [String], $page: Int) {
            Page(page: $page, perPage: 10) {
                media(type: ANIME, genre_in: $genres, tag_in: $tags, sort: SCORE_DESC) {
                    id
                    title {
                        romaji
                        english
                    }
                    averageScore
                    siteUrl
                    coverImage {
                        medium
                    }
                    genres
                    tags {
                        name
                    }
                }
                pageInfo {
                    hasNextPage
                    currentPage
                    lastPage
                }
            }
        }
    `;

    let variables = {
        genres,
        tags,
        page
    };

    try {
        let response = await axios.post(API_URL, { query, variables });
        return response.data.data.Page;
    } catch (error) {
        console.error('Error fetching top anime:', error);
        return null;
    }
}

async function fetchGenres() {
    let query = `
        query {
            GenreCollection
        }
    `;

    try {
        let response = await axios.post(API_URL, { query });
        return response.data.data.GenreCollection;
    } catch (error) {
        console.error('Error fetching genres:', error);
        return null;
    }
}

async function fetchTags() {
    let query = `
        query {
            MediaTagCollection {
                name
                description
                category
                isAdult
            }
        }
    `;

    try {
        let response = await axios.post(API_URL, { query });
        return response.data.data.MediaTagCollection;
    } catch (error) {
        console.error('Error fetching tags:', error);
        return null;
    }
}

async function fetchFillerEpisodes(animeName: string) {
    try {
        let response = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`);
        if (response.data.data && response.data.data.length > 0) {
            let animeId = response.data.data[0].mal_id;
            let fillerResponse = await axios.get(`https://api.jikan.moe/v4/anime/${animeId}/episodes`);
            return fillerResponse.data.data;
        }
        return null;
    } catch (error) {
        console.error('Error fetching filler episodes:', error);
        return null;
    }
}

composer.command("anime", async (ctx: any) => {
    let search = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!search) {
        return ctx.reply('Please provide an anime name. Usage: /anime <anime name>');
    }

    let animeDetails = await fetchAnimeDetails(search);
    if (!animeDetails) {
        return ctx.reply('Anime not found');
    }

    let { id, title, description, siteUrl, coverImage, bannerImage, episodes, status, genres, averageScore, format, season, seasonYear } = animeDetails;
    
    let cleanDesc = cleanDescription(description);
    let titleText = escapeMarkdownV2(title.romaji);
    let englishTitle = title.english && title.english !== title.romaji ? ` \\(${escapeMarkdownV2(title.english)}\\)` : '';
    let nativeTitle = escapeMarkdownV2(title.native || 'N/A');
    let formatText = escapeMarkdownV2(format || 'Unknown');
    let statusText = escapeMarkdownV2(status || 'Unknown');
    let genresText = genres ? escapeMarkdownV2(genres.join(', ')) : 'N/A';
    let seasonText = season && seasonYear ? `*Season:* ${escapeMarkdownV2(season)} ${seasonYear}\n` : '';

    let message = `*🎬 ${titleText}*${englishTitle}
*Native:* ${nativeTitle}
*Format:* ${formatText}
*Episodes:* ${episodes || 'Unknown'}
*Status:* ${statusText}
*Score:* ${averageScore ? `${averageScore}/100` : 'N/A'}
*Genres:* ${genresText}
${seasonText}
*Description:* ${cleanDesc}`;

    let keyboard = new InlineKeyboard()
        .text("❤️ Add to Favorites", `add_fav_${id}`)
        .text("💔 Remove from Favorites", `rem_fav_${id}`)
        .row()
        .url("View on AniList", siteUrl);

    let imageUrl = bannerImage || coverImage?.extraLarge || coverImage?.large || coverImage?.medium;

    if (imageUrl) {
        return ctx.replyWithPhoto(imageUrl, {
            caption: message,
            parse_mode: "MarkdownV2",
            reply_markup: keyboard
        });
    } else {
        return ctx.reply(message, { parse_mode: "MarkdownV2", reply_markup: keyboard });
    }
});

composer.command("manga", async (ctx: any) => {
    let search = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!search) {
        return ctx.reply('Please provide a manga name. Usage: /manga <manga name>');
    }

    let mangaDetails = await fetchMangaDetails(search);
    if (!mangaDetails) {
        return ctx.reply('Manga not found');
    }

    let { id, title, description, siteUrl, coverImage, bannerImage, chapters, volumes, status, genres, averageScore, format } = mangaDetails;
    
    let cleanDesc = cleanDescription(description);
    let titleText = escapeMarkdownV2(title.romaji);
    let englishTitle = title.english && title.english !== title.romaji ? ` \\(${escapeMarkdownV2(title.english)}\\)` : '';
    let nativeTitle = escapeMarkdownV2(title.native || 'N/A');
    let formatText = escapeMarkdownV2(format || 'Unknown');
    let statusText = escapeMarkdownV2(status || 'Unknown');
    let genresText = genres ? escapeMarkdownV2(genres.join(', ')) : 'N/A';

    let message = `*📚 ${titleText}*${englishTitle}
*Native:* ${nativeTitle}
*Format:* ${formatText}
*Chapters:* ${chapters || 'Unknown'}
*Volumes:* ${volumes || 'Unknown'}
*Status:* ${statusText}
*Score:* ${averageScore ? `${averageScore}/100` : 'N/A'}
*Genres:* ${genresText}

*Description:* ${cleanDesc}`;

    let keyboard = new InlineKeyboard().url("View on AniList", siteUrl);

    let imageUrl = bannerImage || coverImage?.extraLarge || coverImage?.large || coverImage?.medium;

    if (imageUrl) {
        return ctx.replyWithPhoto(imageUrl, {
            caption: message,
            parse_mode: "MarkdownV2",
            reply_markup: keyboard
        });
    } else {
        return ctx.reply(message, { parse_mode: "MarkdownV2", reply_markup: keyboard });
    }
});

composer.command("character", async (ctx: any) => {
    let search = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!search) {
        return ctx.reply('Please provide a character name. Usage: /character <character name>');
    }

    let characterDetails = await fetchCharacterDetails(search);
    if (!characterDetails) {
        return ctx.reply('Character not found');
    }

    let { id, name, description, siteUrl, image, gender, age, dateOfBirth } = characterDetails;
    
    let cleanDesc = cleanDescription(description);
    let nameText = escapeMarkdownV2(name.full);
    let nativeText = escapeMarkdownV2(name.native || 'N/A');
    let genderText = escapeMarkdownV2(gender || 'Unknown');
    let ageText = escapeMarkdownV2(age || 'Unknown');

    let birthDate = '';
    if (dateOfBirth && dateOfBirth.day && dateOfBirth.month) {
        birthDate = `${dateOfBirth.day}/${dateOfBirth.month}`;
        if (dateOfBirth.year) birthDate += `/${dateOfBirth.year}`;
        birthDate = `*Birthday:* ${escapeMarkdownV2(birthDate)}\n`;
    }

    let message = `*👤 ${nameText}*
*Native:* ${nativeText}
*Gender:* ${genderText}
*Age:* ${ageText}
${birthDate}
*Description:* ${cleanDesc}`;

    let keyboard = new InlineKeyboard()
        .text("💕 Set as Waifu", `set_waifu_${id}`)
        .text("💙 Set as Husbando", `set_husbando_${id}`)
        .row()
        .url("View on AniList", siteUrl);

    if (image?.large) {
        return ctx.replyWithPhoto(image.large, {
            caption: message,
            parse_mode: "MarkdownV2",
            reply_markup: keyboard
        });
    } else {
        return ctx.reply(message, { parse_mode: "MarkdownV2", reply_markup: keyboard });
    }
});

composer.command(["favorites", "favs"], async (ctx: any) => {
    let userId = ctx.from?.id;
    if (!userId) return;

    let favorites = await get_user_favorites(BigInt(userId));

    if (favorites.length === 0) {
        return ctx.reply('You have no favorite anime yet! Use /anime <name> to add some.');
    }

    let message = '*Your Favorite Anime:*\n\n';
    favorites.forEach((fav: any, index: number) => {
        message += `${index + 1}\\. [${fav.anime_title}](https://anilist.co/anime/${fav.anime_id})\n`;
    });

    return ctx.reply(message, { parse_mode: "MarkdownV2" });
});

composer.command(["mywaifu", "myhusbando"], async (ctx: any) => {
    let userId = ctx.from?.id;
    let isWaifu = ctx.message?.text?.startsWith('/mywaifu');
    
    if (!userId) return;

    let character = await get_user_character(BigInt(userId), isWaifu ? 'waifu' : 'husbando');

    if (!character) {
        return ctx.reply(`You haven't set a ${isWaifu ? 'waifu' : 'husbando'} yet! Use /character <name> to find and set one.`);
    }

    let char = character as any;
    let message = `*Your ${isWaifu ? 'Waifu' : 'Husbando'}:* ${char.character_name.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}`;
    
    let keyboard = new InlineKeyboard().url("View on AniList", `https://anilist.co/character/${char.character_id}`);

    if (char.character_image) {
        return ctx.replyWithPhoto(char.character_image, {
            caption: message,
            parse_mode: "MarkdownV2",
            reply_markup: keyboard
        });
    } else {
        return ctx.reply(message, { parse_mode: "MarkdownV2", reply_markup: keyboard });
    }
});

composer.command("top", async (ctx: any) => {
    let args = ctx.message?.text?.split(' ').slice(1);
    
    if (!args || args.length === 0) {
        return ctx.reply(`*Usage:* /top [genres] [tags]

*Examples:*
/top Action Comedy
/top Mecha School
/top Drama Romance

Use /getgenres and /gettags to see available options.`);
    }

    let allGenres = await fetchGenres();
    let allTags = await fetchTags();
    
    if (!allGenres || !allTags) {
        return ctx.reply('Error fetching genre/tag data.');
    }

    let genres: string[] = [];
    let tags: string[] = [];
    
    let tagNames = allTags.filter((tag: any) => !tag.isAdult).map((tag: any) => tag.name);

    args.forEach((arg: string) => {
        if (allGenres.includes(arg)) {
            genres.push(arg);
        } else if (tagNames.includes(arg)) {
            tags.push(arg);
        }
    });

    if (genres.length === 0 && tags.length === 0) {
        return ctx.reply('No valid genres or tags found. Use /getgenres and /gettags to see available options.');
    }

    let results = await fetchTopAnime(genres, tags);
    if (!results || !results.media || results.media.length === 0) {
        return ctx.reply('No anime found with those criteria.');
    }

    let message = `*Top Anime${genres.length > 0 ? ` \\(${escapeMarkdownV2(genres.join(', '))}\\)` : ''}${tags.length > 0 ? ` \\[${escapeMarkdownV2(tags.join(', '))}\\]` : ''}:*\n\n`;
    
    results.media.slice(0, 10).forEach((anime: any, index: number) => {
        let title = escapeMarkdownV2(anime.title.romaji);
        message += `${index + 1}\\. [${title}](${anime.siteUrl}) \\- ${anime.averageScore || 'N/A'}/100\n`;
    });

    return ctx.reply(message, { parse_mode: "MarkdownV2" });
});

composer.command("getgenres", async (ctx: any) => {
    let genres = await fetchGenres();
    if (!genres) {
        return ctx.reply('Error fetching genres.');
    }

    let message = '*Available Genres:*\n\n';
    genres.forEach((genre: string, index: number) => {
        message += `${Math.floor(index / 3) === index / 3 ? '\n' : ''}${escapeMarkdownV2(genre)}  `;
    });

    return ctx.reply(message, { parse_mode: "MarkdownV2" });
});

composer.command("gettags", async (ctx: any) => {
    let tags = await fetchTags();
    if (!tags) {
        return ctx.reply('Error fetching tags.');
    }

    let filteredTags = tags.filter((tag: any) => !tag.isAdult && tag.category !== 'Technical');
    let message = '*Available Tags:*\n\n';
    
    filteredTags.slice(0, 50).forEach((tag: any, index: number) => {
        message += `${Math.floor(index / 2) === index / 2 ? '\n' : ''}${escapeMarkdownV2(tag.name)}  `;
    });

    message += '\n\n*Note:* Only showing first 50 tags\\. Use specific tag names in /top command\\.';

    return ctx.reply(message, { parse_mode: "MarkdownV2" });
});

composer.command("fillers", async (ctx: any) => {
    let search = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!search) {
        return ctx.reply('Please provide an anime name. Usage: /fillers <anime name>');
    }

    let episodes = await fetchFillerEpisodes(search);
    if (!episodes || episodes.length === 0) {
        return ctx.reply('No episode data found for this anime.');
    }

    let fillerEpisodes = episodes.filter((ep: any) => ep.filler === true);
    
    if (fillerEpisodes.length === 0) {
        return ctx.reply('No filler episodes found for this anime!');
    }

    let message = `*Filler Episodes for ${escapeMarkdownV2(search)}:*\n\n`;
    fillerEpisodes.slice(0, 20).forEach((ep: any) => {
        let title = escapeMarkdownV2(ep.title || 'Unknown Title');
        message += `Episode ${ep.mal_id}: ${title}\n`;
    });

    if (fillerEpisodes.length > 20) {
        message += `\n\\.\\.\\. and ${fillerEpisodes.length - 20} more episodes\\.`;
    }

    return ctx.reply(message, { parse_mode: "MarkdownV2" });
});

composer.on("callback_query", async (ctx: any) => {
    let data = ctx.callbackQuery.data;
    let userId = ctx.from?.id;

    if (!userId) return;

    if (data.startsWith('add_fav_')) {
        let animeId = data.replace('add_fav_', '');
        
        let animeTitle = 'Unknown';
        let animeImage = '';
        
        if (ctx.callbackQuery.message?.caption) {
            let captionMatch = ctx.callbackQuery.message.caption.match(/\*🎬 ([^*]+)\*/);
            if (captionMatch) animeTitle = captionMatch[1];
        }
        
        if (ctx.callbackQuery.message?.photo) {
            animeImage = ctx.callbackQuery.message.photo[ctx.callbackQuery.message.photo.length - 1].file_id;
        }
        
        let success = await add_user_favorite(BigInt(userId), animeId, animeTitle, animeImage);
        
        if (success) {
            await ctx.answerCallbackQuery("Added to favorites! ❤️");
        } else {
            await ctx.answerCallbackQuery("Error adding to favorites.");
        }
    }
    
    if (data.startsWith('rem_fav_')) {
        let animeId = data.replace('rem_fav_', '');
        
        let success = await remove_user_favorite(BigInt(userId), animeId);
        
        if (success) {
            await ctx.answerCallbackQuery("Removed from favorites! 💔");
        } else {
            await ctx.answerCallbackQuery("Error removing from favorites.");
        }
    }
    
    if (data.startsWith('set_waifu_') || data.startsWith('set_husbando_')) {
        let characterId = data.replace(/set_(waifu|husbando)_/, '');
        let type = data.includes('waifu') ? 'waifu' : 'husbando';
        
        let characterName = 'Unknown';
        let characterImage = '';
        
        if (ctx.callbackQuery.message?.caption) {
            let captionMatch = ctx.callbackQuery.message.caption.match(/\*👤 ([^*]+)\*/);
            if (captionMatch) characterName = captionMatch[1];
        }
        
        if (ctx.callbackQuery.message?.photo) {
            characterImage = ctx.callbackQuery.message.photo[ctx.callbackQuery.message.photo.length - 1].file_id;
        }
        
        let success = await set_user_character(BigInt(userId), characterId, characterName, characterImage, type as 'waifu' | 'husbando');
        
        if (success) {
            await ctx.answerCallbackQuery(`Set as your ${type}! ${type === 'waifu' ? '💕' : '💙'}`);
        } else {
            await ctx.answerCallbackQuery("Error setting character.");
        }
    }
});

export default composer;
