/**
 * Message formatting utilities for configurable messages
 */

/**
 * Template variable values for message formatting
 */
export interface MessageVars {
  // Media info
  title?: string;
  year?: string | number;
  rating?: string | number;
  seasons?: string | number;
  runtime?: string | number;
  overview?: string;
  mediaType?: string;
  emoji?: string;
  libraryLabel?: string;

  // Search & Selection
  query?: string;
  count?: string | number;
  max?: string | number;
  index?: string | number;

  // User info
  userName?: string;
  platform?: string;
  id?: string;

  // Status & Progress
  episodeFileCount?: string | number;
  episodeCount?: string | number;
  percentComplete?: string | number;
  progress?: string | number;
  timeLeft?: string;
  monitorType?: string;

  // Admin
  quotaAmount?: string | number;
  quotaMessage?: string;
  targetName?: string;
  targetId?: string;

  // Allow any additional variables
  [key: string]: string | number | undefined;
}

/**
 * Format a message template by replacing {variable} placeholders with values
 *
 * @param template - The message template with {variable} placeholders
 * @param vars - Object containing variable values
 * @returns Formatted message string
 *
 * @example
 * formatMessage('Hello {userName}!', { userName: 'John' })
 * // Returns: 'Hello John!'
 *
 * @example
 * formatMessage('Found {count} results for "{query}":', { count: 5, query: 'Breaking Bad' })
 * // Returns: 'Found 5 results for "Breaking Bad":'
 */
export function formatMessage(template: string, vars: MessageVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    // Keep the placeholder if no value provided
    return match;
  });
}

/**
 * State label messages interface (subset of config.messages)
 */
export interface StateLabelMessages {
  labelIdle: string;
  labelAwaitingSelection: string;
  labelAwaitingConfirmation: string;
  labelAwaitingAnimeConfirmation: string;
  labelAwaitingSeasonSelection: string;
}

/**
 * Get state label from config messages
 * Maps conversation state to the appropriate label
 */
export function getStateLabel(state: string, messages: StateLabelMessages): string {
  const stateLabels: Record<string, string> = {
    'idle': messages.labelIdle,
    'awaiting_selection': messages.labelAwaitingSelection,
    'awaiting_confirmation': messages.labelAwaitingConfirmation,
    'awaiting_anime_confirmation': messages.labelAwaitingAnimeConfirmation,
    'awaiting_season_selection': messages.labelAwaitingSeasonSelection,
  };
  return stateLabels[state] || state;
}
