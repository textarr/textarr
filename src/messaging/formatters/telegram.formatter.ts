import { InlineKeyboard } from 'grammy';
import type { MessageResponse } from '../../handlers/message.handler.js';
import type { MediaSearchResult, ConversationState } from '../../schemas/index.js';
import { EMOJI, getMediaEmoji, getMediaTypeLabel } from '../../constants/index.js';

/**
 * Telegram-specific response with optional keyboard
 */
export interface TelegramFormattedResponse {
  text: string;
  keyboard?: InlineKeyboard;
  photoUrl?: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}

/**
 * Button callback data constants
 */
export const CALLBACK_DATA = {
  SELECT_PREFIX: 'select_',
  CONFIRM_YES: 'confirm_yes',
  CONFIRM_NO: 'confirm_no',
  ANIME_YES: 'anime_yes',
  ANIME_NO: 'anime_no',
  SEASON_PREFIX: 'season_',
  CANCEL: 'cancel',
  BACK: 'back',
} as const;

/**
 * Parse callback data to get action and value
 */
export function parseCallbackData(data: string): { action: string; value?: number } {
  if (data.startsWith(CALLBACK_DATA.SELECT_PREFIX)) {
    return { action: 'select', value: parseInt(data.slice(CALLBACK_DATA.SELECT_PREFIX.length), 10) };
  }
  if (data.startsWith(CALLBACK_DATA.SEASON_PREFIX)) {
    return { action: 'season_select', value: parseInt(data.slice(CALLBACK_DATA.SEASON_PREFIX.length), 10) };
  }
  if (data === CALLBACK_DATA.CONFIRM_YES) {
    return { action: 'confirm' };
  }
  if (data === CALLBACK_DATA.CONFIRM_NO || data === CALLBACK_DATA.CANCEL) {
    return { action: 'cancel' };
  }
  if (data === CALLBACK_DATA.ANIME_YES) {
    return { action: 'anime_confirm' };
  }
  if (data === CALLBACK_DATA.ANIME_NO) {
    return { action: 'regular_confirm' };
  }
  if (data === CALLBACK_DATA.BACK) {
    return { action: 'back' };
  }
  return { action: 'unknown' };
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format a generic message response for Telegram
 */
export function formatTelegramResponse(
  response: MessageResponse,
  sessionState?: ConversationState,
  pendingResults?: MediaSearchResult[]
): TelegramFormattedResponse {
  const result: TelegramFormattedResponse = {
    text: escapeHtml(response.text),
    parseMode: 'HTML',
  };

  // Add poster image if available
  if (response.mediaUrls && response.mediaUrls.length > 0) {
    result.photoUrl = response.mediaUrls[0];
  }

  // Add contextual keyboard based on session state
  if (sessionState === 'awaiting_selection' && pendingResults && pendingResults.length > 0) {
    result.keyboard = createSelectionKeyboard(pendingResults.length);
  } else if (sessionState === 'awaiting_confirmation') {
    result.keyboard = createConfirmationKeyboard();
  } else if (sessionState === 'awaiting_anime_confirmation') {
    result.keyboard = createAnimeConfirmationKeyboard();
  } else if (sessionState === 'awaiting_season_selection') {
    result.keyboard = createSeasonSelectionKeyboard();
  }

  return result;
}

/**
 * Create selection keyboard for search results
 */
export function createSelectionKeyboard(count: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Add number buttons in rows of 5
  for (let i = 1; i <= count; i++) {
    keyboard.text(String(i), `${CALLBACK_DATA.SELECT_PREFIX}${i}`);
    if (i % 5 === 0 && i < count) {
      keyboard.row();
    }
  }

  // Add cancel button on new row
  keyboard.row().text(`${EMOJI.cancel} Cancel`, CALLBACK_DATA.CANCEL);

  return keyboard;
}

/**
 * Create confirmation keyboard (Yes/No)
 */
export function createConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${EMOJI.checkGreen} Yes`, CALLBACK_DATA.CONFIRM_YES)
    .text(`${EMOJI.cancel} No`, CALLBACK_DATA.CONFIRM_NO);
}

/**
 * Create anime confirmation keyboard
 */
export function createAnimeConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Anime', CALLBACK_DATA.ANIME_YES)
    .text('Regular', CALLBACK_DATA.ANIME_NO)
    .row()
    .text(`${EMOJI.cancel} Cancel`, CALLBACK_DATA.CANCEL);
}

/**
 * Create season selection keyboard
 */
export function createSeasonSelectionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('1. All Seasons', `${CALLBACK_DATA.SEASON_PREFIX}1`)
    .text('2. First Only', `${CALLBACK_DATA.SEASON_PREFIX}2`)
    .row()
    .text('3. Latest Only', `${CALLBACK_DATA.SEASON_PREFIX}3`)
    .text('4. Future Only', `${CALLBACK_DATA.SEASON_PREFIX}4`)
    .row()
    .text(`${EMOJI.cancel} Cancel`, CALLBACK_DATA.CANCEL);
}

/**
 * Format search results with rich formatting for Telegram
 */
export function formatSearchResults(
  results: MediaSearchResult[],
  query: string
): TelegramFormattedResponse {
  const lines: string[] = [];
  lines.push(`${EMOJI.search} <b>Found ${results.length} results for "${escapeHtml(query)}":</b>\n`);

  results.forEach((result, index) => {
    const emoji = getMediaEmoji(result.mediaType);
    const year = result.year ? ` (${result.year})` : '';
    const rating = result.rating ? ` ${EMOJI.star}${result.rating.toFixed(1)}` : '';

    // Status indicator based on library status
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

    lines.push(`<b>${index + 1}.</b> ${emoji} ${escapeHtml(result.title)}${year}${rating}${statusIndicator}`);
  });

  lines.push('\n<i>Tap a number to select, or search for something else.</i>');

  return {
    text: lines.join('\n'),
    keyboard: createSelectionKeyboard(results.length),
    parseMode: 'HTML',
  };
}

/**
 * Format confirmation prompt for Telegram
 */
export function formatConfirmation(
  media: MediaSearchResult,
  isSeasonSelection: boolean = false
): TelegramFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';
  const rating = media.rating ? ` ${EMOJI.star} ${media.rating.toFixed(1)}` : '';
  const seasons = media.seasonCount ? ` | ${media.seasonCount} seasons` : '';
  const runtime = media.runtime ? ` | ${media.runtime} min` : '';
  const animeIndicator = media.animeStatus === 'anime' ? ' | <i>Anime</i>' : '';

  const lines: string[] = [];
  lines.push(`${emoji} <b>Found: ${escapeHtml(media.title)}</b>${year}`);
  lines.push(`${type}${rating}${seasons}${runtime}${animeIndicator}`);

  if (media.overview) {
    const shortOverview = media.overview.slice(0, 150) + (media.overview.length > 150 ? '...' : '');
    lines.push('');
    lines.push(`<i>${escapeHtml(shortOverview)}</i>`);
  }

  let keyboard: InlineKeyboard;

  if (isSeasonSelection) {
    lines.push('\n<b>Which seasons would you like to add?</b>');
    keyboard = createSeasonSelectionKeyboard();
  } else {
    lines.push('\n<b>Add this to your library?</b>');
    keyboard = createConfirmationKeyboard();
  }

  return {
    text: lines.join('\n'),
    keyboard,
    photoUrl: media.posterUrl ?? undefined,
    parseMode: 'HTML',
  };
}

/**
 * Format anime confirmation prompt
 */
export function formatAnimeConfirmation(media: MediaSearchResult): TelegramFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';
  const rating = media.rating ? ` ${EMOJI.star} ${media.rating.toFixed(1)}` : '';

  const lines: string[] = [];
  lines.push(`${emoji} <b>Found: ${escapeHtml(media.title)}</b>${year}`);
  lines.push(`${type}${rating}`);
  lines.push('');
  lines.push('<i>This appears to be animated content.</i>');
  lines.push('\n<b>Which library should this go in?</b>');

  return {
    text: lines.join('\n'),
    keyboard: createAnimeConfirmationKeyboard(),
    photoUrl: media.posterUrl ?? undefined,
    parseMode: 'HTML',
  };
}

/**
 * Format success message
 */
export function formatSuccess(media: MediaSearchResult, isAnime: boolean): TelegramFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const libraryLabel = isAnime ? ' (anime)' : '';

  return {
    text: `${EMOJI.checkGreen} ${emoji} <b>${escapeHtml(media.title)}</b>${libraryLabel} added!\n\n<i>It will start downloading shortly. Want to add anything else?</i>`,
    photoUrl: media.posterUrl ?? undefined,
    parseMode: 'HTML',
  };
}

