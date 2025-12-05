import { z } from 'zod';

/**
 * Type of media being requested
 */
export const MediaType = z.enum(['movie', 'tv_show', 'unknown']);
export type MediaType = z.infer<typeof MediaType>;

/**
 * Action the user wants to perform
 */
export const ActionType = z.enum([
  'add', // Add media to library
  'search', // Search for media
  'status', // Check download status
  'help', // Show help
  'confirm', // Confirm selection (yes)
  'cancel', // Cancel operation (no)
  'select', // Select from list (number)
  'anime_confirm', // Confirm media is anime
  'regular_confirm', // Confirm media is regular (not anime)
  'season_select', // Select which seasons to monitor
  'back', // Go back to previous step
  'show_context', // Show current session state
  'restart', // Start fresh, clear session
  'change_selection', // Pick a different option (while in confirmation)
  'admin_add', // Admin: add a user
  'admin_remove', // Admin: remove a user
  'admin_list', // Admin: list all users
  'admin_promote', // Admin: promote user to admin
  'admin_demote', // Admin: demote user from admin
  'admin_quota', // Admin: adjust user quota
  'unknown', // Could not determine
]);
export type ActionType = z.infer<typeof ActionType>;

/**
 * Admin command data
 */
export const AdminCommandSchema = z.object({
  targetPlatform: z.enum(['sms', 'discord', 'slack', 'telegram']).optional(),
  targetId: z.string().optional(),
  userName: z.string().optional(),
  mediaType: z.enum(['movie', 'tv_show']).optional(),
  quotaAmount: z.number().optional(),
});
export type AdminCommand = z.infer<typeof AdminCommandSchema>;

/**
 * Parsed request from AI
 */
export const ParsedRequestSchema = z.object({
  mediaType: MediaType,
  title: z.string().nullable(),
  year: z.number().int().min(1900).max(2100).nullable(),
  action: ActionType,
  selectionNumber: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  rawMessage: z.string().optional(),
  isAnimeRequest: z.boolean().optional(), // True if user explicitly mentioned "anime"
  adminCommand: AdminCommandSchema.optional(), // Admin command data
});
export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;

/**
 * Schema for AI function calling response
 */
export const AIParseResponseSchema = z.object({
  media_type: z.enum(['movie', 'tv_show', 'unknown']),
  title: z.string().nullable(),
  year: z.number().nullable(),
  action: z.enum(['add', 'search', 'status', 'help']),
  confidence: z.number().min(0).max(1),
});
export type AIParseResponse = z.infer<typeof AIParseResponseSchema>;

/**
 * Anime detection status
 */
export const AnimeStatus = z.enum(['anime', 'regular', 'uncertain', 'unknown']);
export type AnimeStatus = z.infer<typeof AnimeStatus>;

/**
 * Detailed library status for media
 */
export const LibraryStatus = z.enum([
  'available', // Fully downloaded and ready to watch
  'monitored', // In library but not downloaded yet
  'partial', // TV shows: some episodes available
  'not_in_library', // Not in library at all
]);
export type LibraryStatus = z.infer<typeof LibraryStatus>;

/**
 * Episode statistics for TV shows
 */
export const EpisodeStatsSchema = z.object({
  episodeFileCount: z.number(),
  episodeCount: z.number(),
  percentComplete: z.number(),
});

/**
 * Media search result (normalized from Sonarr/Radarr)
 */
export const MediaSearchResultSchema = z.object({
  id: z.number(), // TVDB ID for TV, TMDB ID for movies
  title: z.string(),
  year: z.number().nullable(),
  overview: z.string().nullable(),
  posterUrl: z.string().url().nullable(),
  mediaType: MediaType,
  status: z.string().nullable(), // e.g., "ended", "continuing", "released"
  inLibrary: z.boolean(),
  libraryStatus: LibraryStatus.optional(), // Detailed library status
  seasonCount: z.number().nullable(), // For TV shows
  runtime: z.number().nullable(), // For movies (minutes)
  rating: z.number().nullable(), // Rating out of 10
  rawData: z.record(z.unknown()), // Original API response
  animeStatus: AnimeStatus.optional(), // Anime detection result
  episodeStats: EpisodeStatsSchema.optional(), // Episode download stats for TV shows
});
export type MediaSearchResult = z.infer<typeof MediaSearchResultSchema>;

/**
 * Sonarr monitoring types
 */
export const MonitorType = z.enum([
  'all', // Monitor all seasons
  'future', // Only future seasons
  'missing', // Missing episodes only
  'existing', // Only existing episodes
  'firstSeason', // First season only
  'lastSeason', // Latest season only
  'pilot', // Pilot episode only
  'none', // Don't monitor
]);
export type MonitorType = z.infer<typeof MonitorType>;

/**
 * Conversation state machine states
 */
export const ConversationState = z.enum([
  'idle', // Waiting for new request
  'awaiting_selection', // Waiting for user to select from list
  'awaiting_confirmation', // Waiting for yes/no confirmation
  'awaiting_anime_confirmation', // Waiting for user to confirm if animated content is anime or regular
  'awaiting_season_selection', // Waiting for user to select which seasons to monitor
]);
export type ConversationState = z.infer<typeof ConversationState>;

/**
 * Supported messaging platforms
 */
export const Platform = z.enum(['sms', 'discord', 'slack', 'telegram']);
export type Platform = z.infer<typeof Platform>;

/**
 * Session data for a user
 */
export const SessionDataSchema = z.object({
  userId: z.string(), // PlatformUserId format: "platform:id"
  platform: Platform,
  state: ConversationState,
  pendingResults: z.array(MediaSearchResultSchema),
  selectedMedia: MediaSearchResultSchema.nullable(),
  lastActivity: z.date(),
  context: z.record(z.unknown()),
});
export type SessionData = z.infer<typeof SessionDataSchema>;
