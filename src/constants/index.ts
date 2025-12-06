/**
 * Constants for SMS message formatting
 */

// Emoji used in SMS responses
export const EMOJI = {
  movie: '🎬',
  tvShow: '📺',
  check: '✓',
  checkGreen: '✅',
  warning: '⚠️',
  cancel: '❌',
  search: '🔍',
  download: '📥',
  empty: '📭',
  pin: '📍',
  mail: '📬',
  star: '⭐',
  wait: '⏳',
  crown: '👑',
  phone: '📱',
  // Media info emoji
  cast: '🎭',
  trailer: '🎥',
  streaming: '📡',
  rating: '🔞',
  collection: '📚',
  money: '💰',
} as const;

// Session state labels for user-facing messages
export const STATE_LABELS: Record<string, string> = {
  idle: 'Ready for a new request',
  awaiting_selection: 'Waiting for you to pick from search results',
  awaiting_confirmation: 'Waiting for you to confirm',
  awaiting_anime_confirmation: 'Waiting for anime/regular choice',
  awaiting_season_selection: 'Waiting for season selection',
};

// Monitor type labels for TV shows
export const MONITOR_LABELS: Record<string, string> = {
  all: 'all seasons',
  firstSeason: 'first season only',
  lastSeason: 'latest season only',
  future: 'future seasons only',
};

// Season selection options mapping
export const SEASON_MONITOR_TYPES: Record<number, string> = {
  1: 'all',
  2: 'firstSeason',
  3: 'lastSeason',
  4: 'future',
};

// Media type helpers
type MediaType = 'movie' | 'tv_show' | 'unknown';

export function getMediaEmoji(mediaType: MediaType): string {
  return mediaType === 'movie' ? EMOJI.movie : EMOJI.tvShow;
}

export function getMediaTypeLabel(mediaType: MediaType): string {
  return mediaType === 'movie' ? 'Movie' : 'TV Show';
}
