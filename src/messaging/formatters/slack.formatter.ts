import type { MessageResponse } from '../../handlers/message.handler.js';
import type { MediaSearchResult, ConversationState } from '../../schemas/index.js';
import { EMOJI, getMediaEmoji, getMediaTypeLabel } from '../../constants/index.js';

/**
 * Slack Block Kit types (simplified)
 */
interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface SlackSectionBlock {
  type: 'section';
  text?: SlackTextObject;
  accessory?: {
    type: 'image';
    image_url: string;
    alt_text: string;
  };
  fields?: SlackTextObject[];
}

interface SlackActionsBlock {
  type: 'actions';
  elements: SlackButtonElement[];
}

interface SlackButtonElement {
  type: 'button';
  text: SlackTextObject;
  action_id: string;
  style?: 'primary' | 'danger';
  value?: string;
}

interface SlackImageBlock {
  type: 'image';
  image_url: string;
  alt_text: string;
}

interface SlackDividerBlock {
  type: 'divider';
}

interface SlackContextBlock {
  type: 'context';
  elements: SlackTextObject[];
}

type SlackBlock = SlackSectionBlock | SlackActionsBlock | SlackImageBlock | SlackDividerBlock | SlackContextBlock;

/**
 * Slack-specific response with blocks
 */
export interface SlackFormattedResponse {
  text: string; // Fallback text for notifications
  blocks: SlackBlock[];
}

/**
 * Button action IDs for Slack interactions
 */
export const SLACK_ACTION_IDS = {
  SELECT_PREFIX: 'select_',
  CONFIRM_YES: 'confirm_yes',
  CONFIRM_NO: 'confirm_no',
  ANIME_YES: 'anime_yes',
  ANIME_NO: 'anime_no',
  SEASON_PREFIX: 'season_',
  CANCEL: 'cancel',
} as const;

/**
 * Parse Slack action ID to get action and value
 */
export function parseSlackActionId(actionId: string): { action: string; value?: number } {
  if (actionId.startsWith(SLACK_ACTION_IDS.SELECT_PREFIX)) {
    return { action: 'select', value: parseInt(actionId.slice(SLACK_ACTION_IDS.SELECT_PREFIX.length), 10) };
  }
  if (actionId.startsWith(SLACK_ACTION_IDS.SEASON_PREFIX)) {
    return { action: 'season_select', value: parseInt(actionId.slice(SLACK_ACTION_IDS.SEASON_PREFIX.length), 10) };
  }
  if (actionId === SLACK_ACTION_IDS.CONFIRM_YES) {
    return { action: 'confirm' };
  }
  if (actionId === SLACK_ACTION_IDS.CONFIRM_NO || actionId === SLACK_ACTION_IDS.CANCEL) {
    return { action: 'cancel' };
  }
  if (actionId === SLACK_ACTION_IDS.ANIME_YES) {
    return { action: 'anime_confirm' };
  }
  if (actionId === SLACK_ACTION_IDS.ANIME_NO) {
    return { action: 'regular_confirm' };
  }
  return { action: 'unknown' };
}

/**
 * Format a generic message response for Slack
 */
export function formatSlackResponse(
  response: MessageResponse,
  sessionState?: ConversationState,
  pendingResults?: MediaSearchResult[]
): SlackFormattedResponse {
  const blocks: SlackBlock[] = [];

  // Main message block
  const textBlock: SlackSectionBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: response.text,
    },
  };

  // Add poster as accessory if available
  if (response.mediaUrls && response.mediaUrls.length > 0) {
    textBlock.accessory = {
      type: 'image',
      image_url: response.mediaUrls[0]!,
      alt_text: 'Media poster',
    };
  }

  blocks.push(textBlock);

  // Add contextual buttons based on session state
  if (sessionState === 'awaiting_selection' && pendingResults && pendingResults.length > 0) {
    blocks.push(...createSelectionBlocks(pendingResults.length));
  } else if (sessionState === 'awaiting_confirmation') {
    blocks.push(createConfirmationBlock());
  } else if (sessionState === 'awaiting_anime_confirmation') {
    blocks.push(createAnimeConfirmationBlock());
  } else if (sessionState === 'awaiting_season_selection') {
    blocks.push(...createSeasonSelectionBlocks());
  }

  return {
    text: response.text,
    blocks,
  };
}

/**
 * Create selection buttons for search results
 */
export function createSelectionBlocks(count: number): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const buttons: SlackButtonElement[] = [];

  for (let i = 1; i <= count; i++) {
    buttons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: String(i),
        emoji: true,
      },
      action_id: `${SLACK_ACTION_IDS.SELECT_PREFIX}${i}`,
      value: String(i),
    });
  }

  // Slack allows max 5 buttons per actions block
  for (let i = 0; i < buttons.length; i += 5) {
    blocks.push({
      type: 'actions',
      elements: buttons.slice(i, i + 5),
    });
  }

  // Add cancel button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: `${EMOJI.cancel} Cancel`,
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.CANCEL,
        style: 'danger',
      },
    ],
  });

  return blocks;
}

/**
 * Create confirmation block (Yes/No)
 */
export function createConfirmationBlock(): SlackActionsBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: `${EMOJI.checkGreen} Yes`,
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.CONFIRM_YES,
        style: 'primary',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: `${EMOJI.cancel} No`,
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.CONFIRM_NO,
        style: 'danger',
      },
    ],
  };
}

/**
 * Create anime confirmation block
 */
export function createAnimeConfirmationBlock(): SlackActionsBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Anime',
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.ANIME_YES,
        style: 'primary',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Regular',
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.ANIME_NO,
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: `${EMOJI.cancel} Cancel`,
          emoji: true,
        },
        action_id: SLACK_ACTION_IDS.CANCEL,
        style: 'danger',
      },
    ],
  };
}

/**
 * Create season selection blocks
 */
export function createSeasonSelectionBlocks(): SlackBlock[] {
  return [
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'All Seasons',
            emoji: true,
          },
          action_id: `${SLACK_ACTION_IDS.SEASON_PREFIX}1`,
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'First Only',
            emoji: true,
          },
          action_id: `${SLACK_ACTION_IDS.SEASON_PREFIX}2`,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Latest Only',
            emoji: true,
          },
          action_id: `${SLACK_ACTION_IDS.SEASON_PREFIX}3`,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Future Only',
            emoji: true,
          },
          action_id: `${SLACK_ACTION_IDS.SEASON_PREFIX}4`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `${EMOJI.cancel} Cancel`,
            emoji: true,
          },
          action_id: SLACK_ACTION_IDS.CANCEL,
          style: 'danger',
        },
      ],
    },
  ];
}

/**
 * Format search results for Slack
 */
export function formatSearchResultsBlocks(
  results: MediaSearchResult[],
  query: string
): SlackFormattedResponse {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${EMOJI.search} *Search Results for "${query}"*`,
    },
  });

  blocks.push({ type: 'divider' });

  // Results list
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

    lines.push(`*${index + 1}.* ${emoji} ${result.title}${year}${rating}${statusIndicator}`);
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: lines.join('\n'),
    },
  });

  // Selection buttons
  blocks.push(...createSelectionBlocks(results.length));

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Click a number to select, or type to search for something else.',
      },
    ],
  });

  return {
    text: `Found ${results.length} results for "${query}"`,
    blocks,
  };
}

/**
 * Format confirmation blocks for Slack
 */
export function formatConfirmationBlocks(
  media: MediaSearchResult,
  isSeasonSelection: boolean = false
): SlackFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';

  const blocks: SlackBlock[] = [];

  // Header with poster
  const headerBlock: SlackSectionBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${emoji} *${media.title}*${year}`,
    },
  };

  if (media.posterUrl) {
    headerBlock.accessory = {
      type: 'image',
      image_url: media.posterUrl,
      alt_text: media.title,
    };
  }

  blocks.push(headerBlock);

  // Metadata fields
  const fields: SlackTextObject[] = [
    { type: 'mrkdwn', text: `*Type:* ${type}` },
  ];

  if (media.rating) {
    fields.push({ type: 'mrkdwn', text: `*Rating:* ${EMOJI.star} ${media.rating.toFixed(1)}` });
  }
  if (media.seasonCount) {
    fields.push({ type: 'mrkdwn', text: `*Seasons:* ${media.seasonCount}` });
  }
  if (media.runtime) {
    fields.push({ type: 'mrkdwn', text: `*Runtime:* ${media.runtime} min` });
  }
  if (media.animeStatus === 'anime') {
    fields.push({ type: 'mrkdwn', text: `*Library:* Anime` });
  }

  blocks.push({
    type: 'section',
    fields,
  });

  if (media.overview) {
    const shortOverview = media.overview.slice(0, 200) + (media.overview.length > 200 ? '...' : '');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_${shortOverview}_`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  // Action buttons
  if (isSeasonSelection) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Which seasons would you like to add?*',
      },
    });
    blocks.push(...createSeasonSelectionBlocks());
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Add this to your library?*',
      },
    });
    blocks.push(createConfirmationBlock());
  }

  return {
    text: `Found: ${media.title}`,
    blocks,
  };
}

/**
 * Format anime confirmation blocks
 */
export function formatAnimeConfirmationBlocks(media: MediaSearchResult): SlackFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const type = getMediaTypeLabel(media.mediaType);
  const year = media.year ? ` (${media.year})` : '';

  const blocks: SlackBlock[] = [];

  // Header with poster
  const headerBlock: SlackSectionBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${emoji} *${media.title}*${year}`,
    },
  };

  if (media.posterUrl) {
    headerBlock.accessory = {
      type: 'image',
      image_url: media.posterUrl,
      alt_text: media.title,
    };
  }

  blocks.push(headerBlock);

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Type:* ${type}${media.rating ? ` | *Rating:* ${EMOJI.star} ${media.rating.toFixed(1)}` : ''}`,
    },
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '_This appears to be animated content._\n\n*Which library should this go in?*',
    },
  });

  blocks.push(createAnimeConfirmationBlock());

  return {
    text: `Found: ${media.title} - Choose library type`,
    blocks,
  };
}

/**
 * Format success blocks
 */
export function formatSuccessBlocks(media: MediaSearchResult, isAnime: boolean): SlackFormattedResponse {
  const emoji = getMediaEmoji(media.mediaType);
  const libraryLabel = isAnime ? ' (anime)' : '';

  const blocks: SlackBlock[] = [];

  const headerBlock: SlackSectionBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${EMOJI.checkGreen} *Added Successfully*\n\n${emoji} *${media.title}*${libraryLabel} has been added to your library!\n\n_It will start downloading shortly._`,
    },
  };

  if (media.posterUrl) {
    headerBlock.accessory = {
      type: 'image',
      image_url: media.posterUrl,
      alt_text: media.title,
    };
  }

  blocks.push(headerBlock);

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Want to add anything else?',
      },
    ],
  });

  return {
    text: `${media.title} added to library`,
    blocks,
  };
}

