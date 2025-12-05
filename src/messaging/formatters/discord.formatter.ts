import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type APIActionRowComponent,
  type APIButtonComponent,
} from 'discord.js';
import type { MessageResponse } from '../../handlers/message.handler.js';
import type { MediaSearchResult, ConversationState } from '../../schemas/index.js';
import { EMOJI, getMediaEmoji, getMediaTypeLabel } from '../../constants/index.js';

/**
 * Discord-specific response with embeds and buttons
 */
export interface DiscordFormattedResponse {
  content?: string;
  embeds?: APIEmbed[];
  components?: APIActionRowComponent<APIButtonComponent>[];
}

/**
 * Button custom IDs for Discord interactions
 */
export const DISCORD_BUTTON_IDS = {
  SELECT_PREFIX: 'select_',
  CONFIRM_YES: 'confirm_yes',
  CONFIRM_NO: 'confirm_no',
  ANIME_YES: 'anime_yes',
  ANIME_NO: 'anime_no',
  SEASON_PREFIX: 'season_',
  CANCEL: 'cancel',
} as const;

/**
 * Parse Discord button custom ID to get action and value
 */
export function parseDiscordButtonId(customId: string): { action: string; value?: number } {
  if (customId.startsWith(DISCORD_BUTTON_IDS.SELECT_PREFIX)) {
    return { action: 'select', value: parseInt(customId.slice(DISCORD_BUTTON_IDS.SELECT_PREFIX.length), 10) };
  }
  if (customId.startsWith(DISCORD_BUTTON_IDS.SEASON_PREFIX)) {
    return { action: 'season_select', value: parseInt(customId.slice(DISCORD_BUTTON_IDS.SEASON_PREFIX.length), 10) };
  }
  if (customId === DISCORD_BUTTON_IDS.CONFIRM_YES) {
    return { action: 'confirm' };
  }
  if (customId === DISCORD_BUTTON_IDS.CONFIRM_NO || customId === DISCORD_BUTTON_IDS.CANCEL) {
    return { action: 'cancel' };
  }
  if (customId === DISCORD_BUTTON_IDS.ANIME_YES) {
    return { action: 'anime_confirm' };
  }
  if (customId === DISCORD_BUTTON_IDS.ANIME_NO) {
    return { action: 'regular_confirm' };
  }
  return { action: 'unknown' };
}

/**
 * Format a generic message response for Discord
 */
export function formatDiscordResponse(
  response: MessageResponse,
  sessionState?: ConversationState,
  pendingResults?: MediaSearchResult[]
): DiscordFormattedResponse {
  const result: DiscordFormattedResponse = {};

  // Create embed for the message
  const embed = new EmbedBuilder()
    .setDescription(response.text)
    .setColor(0x5865F2); // Discord blurple

  // Add poster as thumbnail if available
  if (response.mediaUrls && response.mediaUrls.length > 0) {
    embed.setThumbnail(response.mediaUrls[0]!);
  }

  result.embeds = [embed.toJSON()];

  // Add contextual buttons based on session state
  if (sessionState === 'awaiting_selection' && pendingResults && pendingResults.length > 0) {
    result.components = createSelectionButtons(pendingResults.length);
  } else if (sessionState === 'awaiting_confirmation') {
    result.components = createConfirmationButtons();
  } else if (sessionState === 'awaiting_anime_confirmation') {
    result.components = createAnimeConfirmationButtons();
  } else if (sessionState === 'awaiting_season_selection') {
    result.components = createSeasonSelectionButtons();
  }

  return result;
}

/**
 * Create selection buttons for search results
 */
export function createSelectionButtons(count: number): APIActionRowComponent<APIButtonComponent>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 1; i <= count; i++) {
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${DISCORD_BUTTON_IDS.SELECT_PREFIX}${i}`)
        .setLabel(String(i))
        .setStyle(ButtonStyle.Primary)
    );

    // Discord allows max 5 buttons per row
    if (i % 5 === 0 || i === count) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
  }

  // Add cancel button
  const cancelRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.cancel)
    );
  rows.push(cancelRow);

  return rows.map(row => row.toJSON());
}

/**
 * Create confirmation buttons (Yes/No)
 */
export function createConfirmationButtons(): APIActionRowComponent<APIButtonComponent>[] {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.CONFIRM_YES)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success)
        .setEmoji(EMOJI.checkGreen),
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.CONFIRM_NO)
        .setLabel('No')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.cancel)
    );

  return [row.toJSON()];
}

/**
 * Create anime confirmation buttons
 */
export function createAnimeConfirmationButtons(): APIActionRowComponent<APIButtonComponent>[] {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.ANIME_YES)
        .setLabel('Anime')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.ANIME_NO)
        .setLabel('Regular')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.cancel)
    );

  return [row.toJSON()];
}

/**
 * Create season selection buttons
 */
export function createSeasonSelectionButtons(): APIActionRowComponent<APIButtonComponent>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`${DISCORD_BUTTON_IDS.SEASON_PREFIX}1`)
        .setLabel('All Seasons')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${DISCORD_BUTTON_IDS.SEASON_PREFIX}2`)
        .setLabel('First Only')
        .setStyle(ButtonStyle.Secondary)
    );

  const row2 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`${DISCORD_BUTTON_IDS.SEASON_PREFIX}3`)
        .setLabel('Latest Only')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${DISCORD_BUTTON_IDS.SEASON_PREFIX}4`)
        .setLabel('Future Only')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(DISCORD_BUTTON_IDS.CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.cancel)
    );

  return [row1.toJSON(), row2.toJSON()];
}

/**
 * Format search results as Discord embed
 */
export function formatSearchResultsEmbed(
  results: MediaSearchResult[],
  query: string
): DiscordFormattedResponse {
  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.search} Search Results for "${query}"`)
    .setColor(0x5865F2);

  const lines: string[] = [];
  results.forEach((result, index) => {
    const emoji = getMediaEmoji(result.mediaType);
    const year = result.year ? ` (${result.year})` : '';
    const rating = result.rating ? ` ${EMOJI.star}${result.rating.toFixed(1)}` : '';

    let statusIndicator = '';
    if (result.inLibrary) {
      switch (result.libraryStatus) {
        case 'available':
          statusIndicator = ` ${EMOJI.check}`;
          break;
        case 'partial': {
          const pct = result.episodeStats?.percentComplete ?? 0;
          statusIndicator = ` (${Math.round(pct)}%)`;
          break;
        }
        case 'monitored':
          statusIndicator = ` ${EMOJI.wait}`;
          break;
        default:
          statusIndicator = ` ${EMOJI.check}`;
      }
    }

    lines.push(`**${index + 1}.** ${emoji} ${result.title}${year}${rating}${statusIndicator}`);
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: 'Click a number to select, or type to search for something else.' });

  return {
    embeds: [embed.toJSON()],
    components: createSelectionButtons(results.length),
  };
}

/**
 * Format confirmation embed for Discord
 */
export function formatConfirmationEmbed(
  media: MediaSearchResult,
  isSeasonSelection: boolean = false
): DiscordFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${media.title}${year}`)
    .setColor(media.mediaType === 'movie' ? 0xE74C3C : 0x3498DB);

  // Add metadata fields
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Type', value: type, inline: true },
  ];

  if (media.rating) {
    fields.push({ name: 'Rating', value: `${EMOJI.star} ${media.rating.toFixed(1)}`, inline: true });
  }
  if (media.seasonCount) {
    fields.push({ name: 'Seasons', value: String(media.seasonCount), inline: true });
  }
  if (media.runtime) {
    fields.push({ name: 'Runtime', value: `${media.runtime} min`, inline: true });
  }
  if (media.animeStatus === 'anime') {
    fields.push({ name: 'Library', value: 'Anime', inline: true });
  }

  embed.addFields(fields);

  if (media.overview) {
    const shortOverview = media.overview.slice(0, 200) + (media.overview.length > 200 ? '...' : '');
    embed.setDescription(shortOverview);
  }

  if (media.posterUrl) {
    embed.setThumbnail(media.posterUrl);
  }

  let components: APIActionRowComponent<APIButtonComponent>[];
  if (isSeasonSelection) {
    embed.setFooter({ text: 'Which seasons would you like to add?' });
    components = createSeasonSelectionButtons();
  } else {
    embed.setFooter({ text: 'Add this to your library?' });
    components = createConfirmationButtons();
  }

  return {
    embeds: [embed.toJSON()],
    components,
  };
}

/**
 * Format anime confirmation embed
 */
export function formatAnimeConfirmationEmbed(media: MediaSearchResult): DiscordFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${media.title}${year}`)
    .setDescription('This appears to be animated content.\n\n**Which library should this go in?**')
    .setColor(0x9B59B6);

  embed.addFields([{ name: 'Type', value: type, inline: true }]);

  if (media.rating) {
    embed.addFields([{ name: 'Rating', value: `${EMOJI.star} ${media.rating.toFixed(1)}`, inline: true }]);
  }

  if (media.posterUrl) {
    embed.setThumbnail(media.posterUrl);
  }

  return {
    embeds: [embed.toJSON()],
    components: createAnimeConfirmationButtons(),
  };
}

/**
 * Format success embed
 */
export function formatSuccessEmbed(media: MediaSearchResult, isAnime: boolean): DiscordFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const libraryLabel = isAnime ? ' (anime)' : '';

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.checkGreen} Added Successfully`)
    .setDescription(`${emoji} **${media.title}**${libraryLabel} has been added to your library!\n\nIt will start downloading shortly.`)
    .setColor(0x2ECC71);

  if (media.posterUrl) {
    embed.setThumbnail(media.posterUrl);
  }

  embed.setFooter({ text: 'Want to add anything else?' });

  return {
    embeds: [embed.toJSON()],
  };
}

