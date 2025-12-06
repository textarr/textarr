import type { Logger } from '../utils/logger.js';
import type { Services } from '../services/index.js';
import type { Config } from '../config/index.js';
import type {
  MediaSearchResult,
  ParsedRequest,
  AnimeStatus,
  LibraryStatus,
  RecommendationParams,
} from '../schemas/index.js';
import { createPlatformUserId, parsePlatformUserId, type PlatformUserId, type Platform } from '../messaging/types.js';
import { EMOJI, MONITOR_LABELS, SEASON_MONITOR_TYPES, getMediaEmoji, getMediaTypeLabel } from '../constants/index.js';
import { formatMessage, getStateLabel } from '../utils/messages.js';

/**
 * Response from message handler
 */
export interface MessageResponse {
  text: string;
  /** Optional media URLs (poster images) to include in MMS */
  mediaUrls?: string[];
}

/**
 * Message handler for processing requests from any messaging platform
 */
export class MessageHandler {
  private readonly services: Services;
  private readonly config: Config;
  private readonly logger: Logger;

  constructor(services: Services, config: Config, logger: Logger) {
    this.services = services;
    this.config = config;
    this.logger = logger.child({ handler: 'message' });
  }

  /**
   * Handle an incoming message from any platform
   */
  async handleMessage(userId: PlatformUserId, message: string): Promise<MessageResponse> {
    this.logger.info({ userId, message }, 'Handling message');

    // Check if user is authorized
    const { platform, rawId } = parsePlatformUserId(userId);
    if (!this.services.user.isAuthorized(userId)) {
      this.logger.info({ userId, platform }, 'Unregistered user attempted to use bot');

      // Check if we should respond to unregistered users for this platform
      // SMS always stays silent for security/cost reasons
      if (platform === 'sms') {
        return { text: '' };
      }

      const shouldRespond = this.getPlatformRespondToUnregistered(platform);
      if (shouldRespond) {
        const messageTemplate = this.config.session.unregisteredMessage;
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        return { text: messageTemplate.replace('{id}', rawId).replace('{platform}', platformName) };
      }

      return { text: '' };
    }

    try {
      // Get current session state
      const session = this.services.session.getSession(userId);

      // Parse the message with AI, passing session context for natural conversation
      const parsed = await this.services.ai.parseMessage(message, {
        state: session.state,
        pendingResults: session.pendingResults,
        selectedMedia: session.selectedMedia,
      });
      this.logger.info({
        action: parsed.action,
        title: parsed.title,
        sessionState: session.state,
        confidence: parsed.confidence,
      }, 'Parsed request - routing action');

      // Route based on action and session state
      switch (parsed.action) {
        case 'help':
          this.logger.debug({ action: 'help' }, 'Returning help message');
          return { text: this.getHelpMessage(this.services.user.isAdmin(userId)) };

        case 'status':
          return { text: await this.handleStatusRequest() };

        case 'cancel':
          this.services.session.resetSession(userId);
          return { text: `${EMOJI.cancel} ${this.config.messages.cancelled}` };

        case 'confirm':
          if (session.state === 'awaiting_confirmation') {
            return await this.handleConfirmation(userId);
          }
          // YES during season selection means "all seasons"
          if (session.state === 'awaiting_season_selection') {
            return await this.handleSeasonSelection(userId, 1);
          }
          return { text: this.config.messages.nothingToConfirm };

        case 'select':
          if (session.state === 'awaiting_selection' && parsed.selectionNumber) {
            return await this.handleSelection(userId, parsed.selectionNumber);
          }
          if (session.state === 'awaiting_season_selection' && parsed.selectionNumber) {
            return await this.handleSeasonSelection(userId, parsed.selectionNumber);
          }
          return { text: this.config.messages.nothingToSelect };

        case 'anime_confirm':
          if (session.state === 'awaiting_anime_confirmation') {
            return await this.handleAnimeConfirmation(userId, true);
          }
          return { text: this.config.messages.nothingToConfirm };

        case 'regular_confirm':
          if (session.state === 'awaiting_anime_confirmation') {
            return await this.handleAnimeConfirmation(userId, false);
          }
          return { text: this.config.messages.nothingToConfirm };

        // New conversational actions
        case 'back':
          return this.handleBack(userId);

        case 'show_context':
          return this.handleShowContext(userId);

        case 'restart':
          this.services.session.resetSession(userId);
          return { text: this.config.messages.restart };

        case 'decline':
          return { text: this.config.messages.goodbyeMessage };

        case 'continue':
          return { text: this.config.messages.addPrompt };

        case 'change_selection':
          // User wants to pick different option while in confirmation
          if (parsed.selectionNumber && session.pendingResults.length > 0) {
            return await this.handleSelection(userId, parsed.selectionNumber);
          }
          return { text: this.config.messages.noPreviousResults };

        case 'season_select':
          if (session.state === 'awaiting_season_selection' && parsed.selectionNumber) {
            return await this.handleSeasonSelection(userId, parsed.selectionNumber);
          }
          return { text: this.config.messages.nothingToSelect };

        // Admin commands
        case 'admin_help':
          return this.handleAdminHelp(userId);
        case 'admin_list':
          return this.handleAdminList(userId);
        case 'admin_add':
          return this.handleAdminAdd(userId, parsed);
        case 'admin_remove':
          return this.handleAdminRemove(userId, parsed);
        case 'admin_promote':
          return this.handleAdminPromote(userId, parsed);
        case 'admin_demote':
          return this.handleAdminDemote(userId, parsed);
        case 'admin_quota':
          return this.handleAdminQuota(userId, parsed);

        case 'add':
        case 'search':
          return await this.handleMediaRequest(userId, parsed);

        case 'recommend':
          return await this.handleRecommendationRequest(userId, parsed);

        default:
          return {
            text: this.config.messages.unknownCommand,
          };
      }
    } catch (error) {
      this.logger.error({ error, userId, message }, 'Error handling message');
      return { text: `${EMOJI.warning} ${this.config.messages.genericError}` };
    }
  }

  /**
   * Handle a media request (add or search)
   *
   * Uses TMDB multi-search for unified movie/TV results with media_type.
   * Falls back to direct Radarr/Sonarr search if TMDB is not configured.
   */
  private async handleMediaRequest(
    userId: PlatformUserId,
    parsed: ParsedRequest
  ): Promise<MessageResponse> {
    if (!parsed.title) {
      return { text: this.config.messages.addPrompt };
    }

    this.logger.info({ title: parsed.title, year: parsed.year }, 'Starting media search');

    let results: MediaSearchResult[];

    // Use TMDB multi-search for unified results (Overseerr style)
    try {
      const searchStart = Date.now();
      results = await this.services.tmdb.searchMulti(parsed.title);
      this.logger.info({
        title: parsed.title,
        resultCount: results.length,
        searchTimeMs: Date.now() - searchStart,
      }, 'TMDB search complete');

      // Enrich with library status from Radarr/Sonarr
      const enrichStart = Date.now();
      results = await this.enrichWithLibraryStatus(results);
      this.logger.info({
        resultCount: results.length,
        enrichTimeMs: Date.now() - enrichStart,
      }, 'Library status enrichment complete');
    } catch (error) {
      // Fall back to direct Radarr/Sonarr search if TMDB fails
      this.logger.warn({ error }, 'TMDB search failed, falling back to direct search');
      const [movies, shows] = await Promise.all([
        this.services.radarr.search(parsed.title),
        this.services.sonarr.search(parsed.title),
      ]);
      results = [...movies, ...shows];
    }

    // Filter by year if specified
    if (parsed.year) {
      const yearFiltered = results.filter((r) => r.year === parsed.year);
      if (yearFiltered.length > 0) {
        results = yearFiltered;
        this.logger.debug({ year: parsed.year, filteredCount: results.length }, 'Filtered by year');
      }
    }

    // Limit results
    results = results.slice(0, this.config.session.maxSearchResults);

    if (results.length === 0) {
      this.logger.info({ title: parsed.title }, 'No results found');
      return {
        text: `${EMOJI.search} ${formatMessage(this.config.messages.noResults, { query: parsed.title })}`,
      };
    }

    // Check if already in library
    const singleResult = results.length === 1 ? results[0] : undefined;
    if (singleResult?.inLibrary) {
      this.logger.info({ title: singleResult.title, libraryStatus: singleResult.libraryStatus }, 'Single result already in library');
      return { text: this.formatAlreadyInLibrary(singleResult) };
    }

    // Single result - detect anime and ask for confirmation
    if (singleResult) {
      const media = await this.detectAnimeForMedia(singleResult, parsed.isAnimeRequest);
      this.services.session.setSelectedMedia(userId, media);
      this.logger.info({ title: media.title, mediaType: media.mediaType, animeStatus: media.animeStatus }, 'Single result - awaiting confirmation');

      // If anime status is uncertain, ask user
      if (media.animeStatus === 'uncertain') {
        this.services.session.setState(userId, 'awaiting_anime_confirmation');
        return this.formatAnimeConfirmationPrompt(media);
      }

      return this.formatConfirmationPrompt(media, userId);
    }

    // Multiple results - ask for selection
    this.logger.info({ resultCount: results.length }, 'Multiple results - awaiting selection');
    this.services.session.setPendingResults(userId, results);
    return { text: this.formatSelectionPrompt(results, parsed.title) };
  }

  /**
   * Enrich TMDB results with library status from Radarr/Sonarr
   *
   * Uses efficient single-item lookups by ID instead of fetching entire library.
   * For movies: Check TMDB ID against Radarr library
   * For TV shows: Fetch TVDB ID from TMDB, then check Sonarr library
   */
  private async enrichWithLibraryStatus(
    results: MediaSearchResult[]
  ): Promise<MediaSearchResult[]> {
    this.logger.debug({ resultCount: results.length }, 'Enriching results with library status');

    // Process each result in parallel with individual lookups
    const enrichedResults = await Promise.all(
      results.map(async (result) => {
        try {
          if (result.mediaType === 'movie') {
            // Efficient single lookup by TMDB ID
            const movie = await this.services.radarr.getMovieByTmdbId(result.id);
            if (movie) {
              const status: LibraryStatus = movie.hasFile ? 'available' : 'monitored';
              return {
                ...result,
                inLibrary: true,
                libraryStatus: status,
                rawData: { ...result.rawData, status: movie.status },
              };
            }
          } else if (result.mediaType === 'tv_show') {
            // First get TVDB ID from TMDB
            const tvdbId = await this.services.tmdb.getTvdbId(result.id);
            if (tvdbId) {
              // Efficient single lookup by TVDB ID
              const series = await this.services.sonarr.getSeriesByTvdbId(tvdbId);
              if (series) {
                const stats = series.statistics;
                const episodeFileCount = stats?.episodeFileCount ?? 0;
                const episodeCount = stats?.episodeCount ?? 0;
                const percentComplete = stats?.percentOfEpisodes ?? 0;

                let status: LibraryStatus;
                if (episodeCount === 0) {
                  status = 'monitored';
                } else if (episodeFileCount === episodeCount) {
                  status = 'available';
                } else if (episodeFileCount > 0) {
                  status = 'partial';
                } else {
                  status = 'monitored';
                }

                return {
                  ...result,
                  inLibrary: true,
                  libraryStatus: status,
                  episodeStats:
                    episodeCount > 0
                      ? { episodeFileCount, episodeCount, percentComplete }
                      : undefined,
                  rawData: { ...result.rawData, status: series.status },
                };
              }
            }
          }
        } catch (error) {
          this.logger.warn({ error, resultId: result.id }, 'Failed to check library status');
        }

        // Not in library or lookup failed
        return { ...result, inLibrary: false, libraryStatus: 'not_in_library' as const };
      })
    );

    this.logger.debug('Library status enrichment complete');
    return enrichedResults;
  }

  /**
   * Handle selection from a list
   */
  private async handleSelection(userId: PlatformUserId, selection: number): Promise<MessageResponse> {
    const results = this.services.session.getPendingResults(userId);

    if (selection < 1 || selection > results.length) {
      return { text: formatMessage(this.config.messages.selectRange, { max: results.length }) };
    }

    const selected = results[selection - 1];
    if (!selected) {
      return { text: formatMessage(this.config.messages.selectRange, { max: results.length }) };
    }

    if (selected.inLibrary) {
      this.services.session.resetSession(userId);
      return { text: this.formatAlreadyInLibrary(selected) };
    }

    // Detect anime for the selected item
    const media = await this.detectAnimeForMedia(selected);
    this.services.session.setSelectedMedia(userId, media);

    // If anime status is uncertain, ask user
    if (media.animeStatus === 'uncertain') {
      this.services.session.setState(userId, 'awaiting_anime_confirmation');
      return this.formatAnimeConfirmationPrompt(media);
    }

    return this.formatConfirmationPrompt(media, userId);
  }

  /**
   * Handle season selection for TV shows
   */
  private async handleSeasonSelection(
    userId: PlatformUserId,
    selection: number
  ): Promise<MessageResponse> {
    const media = this.services.session.getSelectedMedia(userId);

    if (!media) {
      this.services.session.resetSession(userId);
      return { text: this.config.messages.nothingSelected };
    }

    if (selection < 1 || selection > 4) {
      return { text: formatMessage(this.config.messages.selectRange, { max: 4 }) };
    }

    const monitorType = SEASON_MONITOR_TYPES[selection]!;

    // Use atomic state update to prevent race condition
    this.services.session.setStateWithContext(userId, 'awaiting_confirmation', { monitorType });

    const text = `${EMOJI.tvShow} ${media.title}\n${formatMessage(this.config.messages.seasonConfirmPrompt, { monitorType: MONITOR_LABELS[monitorType] })}`;
    return { text };
  }

  /**
   * Handle going back to previous step
   */
  private handleBack(userId: PlatformUserId): MessageResponse {
    const session = this.services.session.getSession(userId);

    // If we have pending results, go back to selection
    if (session.pendingResults.length > 0) {
      this.services.session.setState(userId, 'awaiting_selection');
      return { text: this.formatSelectionPrompt(session.pendingResults, 'previous search') };
    }

    // Otherwise reset
    this.services.session.resetSession(userId);
    return { text: this.config.messages.backToStart };
  }

  /**
   * Show current session context to user
   */
  private handleShowContext(userId: PlatformUserId): MessageResponse {
    const session = this.services.session.getSession(userId);

    const stateLabel = getStateLabel(session.state, this.config.messages);
    let text = `${EMOJI.pin} ${stateLabel}`;

    if (session.selectedMedia) {
      text += `\n\nSelected: ${session.selectedMedia.title}${session.selectedMedia.year ? ` (${session.selectedMedia.year})` : ''}`;
    }

    if (session.pendingResults.length > 0) {
      text += `\n\nSearch results: ${session.pendingResults.length} items`;
    }

    text += '\n\nSay "restart" to start over.';

    return { text };
  }

  /**
   * Handle confirmation to add media
   *
   * Uses the centralized addMediaToLibrary method which handles
   * anime routing automatically based on anime status.
   */
  private async handleConfirmation(userId: PlatformUserId): Promise<MessageResponse> {
    const media = this.services.session.getSelectedMedia(userId);

    if (!media) {
      this.services.session.resetSession(userId);
      return { text: this.config.messages.nothingSelected };
    }

    // Check quota before adding
    const quotaCheck = this.services.user.checkQuota(
      userId,
      media.mediaType === 'movie' ? 'movie' : 'tv_show'
    );

    if (!quotaCheck.allowed) {
      this.services.session.resetSession(userId);
      return { text: `${EMOJI.warning} ${formatMessage(this.config.messages.quotaExceeded, { quotaMessage: quotaCheck.message })}` };
    }

    return await this.addMediaToLibrary(userId, media);
  }

  /**
   * Handle status request
   */
  private async handleStatusRequest(): Promise<string> {
    const [sonarrQueue, radarrQueue] = await Promise.all([
      this.services.sonarr.getQueue(),
      this.services.radarr.getQueue(),
    ]);

    const allQueue = [...sonarrQueue, ...radarrQueue];

    if (allQueue.length === 0) {
      return `${EMOJI.empty} ${this.config.messages.nothingDownloading}`;
    }

    const lines = [`${EMOJI.download} ${this.config.messages.currentlyDownloading}\n`];
    for (const item of allQueue.slice(0, 5)) {
      const timeLeft = item.timeLeft ? ` (${item.timeLeft})` : '';
      lines.push(`• ${item.title} - ${item.progress}%${timeLeft}`);
    }

    if (allQueue.length > 5) {
      lines.push(`\n...and ${allQueue.length - 5} more`);
    }

    return lines.join('\n');
  }

  /**
   * Format confirmation prompt (includes poster if available)
   * For TV shows with multiple seasons, this prompts for season selection first
   */
  private formatConfirmationPrompt(media: MediaSearchResult, userId: PlatformUserId): MessageResponse {
    const emoji = getMediaEmoji(media.mediaType);
    const type = getMediaTypeLabel(media.mediaType);
    const year = media.year ? ` (${media.year})` : '';
    const rating = media.rating ? ` ${EMOJI.star} ${media.rating.toFixed(1)}` : '';
    const seasons = media.seasonCount ? ` | ${media.seasonCount} seasons` : '';
    const runtime = media.runtime ? ` | ${media.runtime} min` : '';
    const animeIndicator = media.animeStatus === 'anime' ? ' | Anime' : '';

    let text = `${emoji} Found: ${media.title}${year} - ${type}${rating}${seasons}${runtime}${animeIndicator}`;

    if (media.overview) {
      const shortOverview =
        media.overview.slice(0, 100) + (media.overview.length > 100 ? '...' : '');
      text += `\n\n${shortOverview}`;
    }

    // For TV shows with multiple seasons, ask which seasons to monitor
    if (media.mediaType === 'tv_show' && media.seasonCount && media.seasonCount > 1) {
      this.services.session.setState(userId, 'awaiting_season_selection');
      text += `\n\n${this.config.messages.seasonSelectPrompt}`;
    } else if (media.animeStatus === 'anime') {
      this.services.session.setState(userId, 'awaiting_confirmation');
      text += `\n\n${this.config.messages.confirmAnimePrompt}`;
    } else {
      this.services.session.setState(userId, 'awaiting_confirmation');
      text += `\n\n${this.config.messages.confirmPrompt}`;
    }

    // Include poster URL for MMS if available
    const mediaUrls = media.posterUrl ? [media.posterUrl] : undefined;

    return { text, mediaUrls };
  }

  /**
   * Format anime confirmation prompt (when detection is uncertain)
   */
  private formatAnimeConfirmationPrompt(media: MediaSearchResult): MessageResponse {
    const emoji = getMediaEmoji(media.mediaType);
    const type = getMediaTypeLabel(media.mediaType);
    const year = media.year ? ` (${media.year})` : '';
    const rating = media.rating ? ` ${EMOJI.star} ${media.rating.toFixed(1)}` : '';

    let text = `${emoji} Found: ${media.title}${year} - ${type}${rating}`;
    text += `\n\n${this.config.messages.animeOrRegularPrompt}`;

    // Set session state to awaiting anime confirmation
    // Note: This is handled by the caller setting the session state

    // Include poster URL for MMS if available
    const mediaUrls = media.posterUrl ? [media.posterUrl] : undefined;

    return { text, mediaUrls };
  }

  /**
   * Format selection prompt with detailed status indicators
   */
  private formatSelectionPrompt(results: MediaSearchResult[], query: string): string {
    const lines = [`${EMOJI.search} ${formatMessage(this.config.messages.searchResults, { count: results.length, query })}\n`];

    results.forEach((result, index) => {
      const emoji = getMediaEmoji(result.mediaType);
      const year = result.year ? ` (${result.year})` : '';
      const rating = result.rating ? ` ${EMOJI.star}${result.rating.toFixed(1)}` : '';

      // Enhanced status indicator based on libraryStatus
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

      lines.push(`${index + 1}. ${emoji} ${result.title}${year}${rating}${statusIndicator}`);
    });

    lines.push(`\n${this.config.messages.selectPrompt}`);
    return lines.join('\n');
  }

  /**
   * Format already in library message with detailed status
   */
  private formatAlreadyInLibrary(media: MediaSearchResult): string {
    const emoji = getMediaEmoji(media.mediaType);
    const year = media.year ? ` (${media.year})` : '';
    const title = `${emoji} ${media.title}${year}`;

    switch (media.libraryStatus) {
      case 'available':
        return `${formatMessage(this.config.messages.alreadyAvailable, { title })} ${EMOJI.check}`;

      case 'partial':
        if (media.episodeStats) {
          const { episodeFileCount, episodeCount, percentComplete } = media.episodeStats;
          return formatMessage(this.config.messages.alreadyPartial, {
            title,
            episodeFileCount,
            episodeCount,
            percentComplete: Math.round(percentComplete),
          });
        }
        return formatMessage(this.config.messages.alreadyPartial, { title, episodeFileCount: '?', episodeCount: '?', percentComplete: '?' });

      case 'monitored': {
        // Check raw status for more context (case-insensitive)
        const rawStatus = (media.rawData?.status as string | undefined)?.toLowerCase();
        if (rawStatus === 'announced' || rawStatus === 'incinemas' || rawStatus === 'tba') {
          return formatMessage(this.config.messages.alreadyWaitingRelease, { title });
        }
        if (rawStatus === 'continuing') {
          return formatMessage(this.config.messages.alreadyWaitingEpisodes, { title });
        }
        return formatMessage(this.config.messages.alreadyMonitored, { title });
      }

      default:
        // Fallback for backward compatibility
        return `${formatMessage(this.config.messages.alreadyInLibrary, { title })} ${EMOJI.check}`;
    }
  }

  /**
   * Format added message (no poster - already shown in confirmation prompt)
   */
  private formatAddedMessage(media: MediaSearchResult, isAnime: boolean): MessageResponse {
    const emoji = getMediaEmoji(media.mediaType);
    const libraryLabel = isAnime ? ' (anime)' : '';
    const title = `${emoji} ${media.title}${libraryLabel}`;
    const text = `${EMOJI.checkGreen} ${formatMessage(this.config.messages.mediaAdded, { title })}`;

    return { text };
  }

  /**
   * Handle anime confirmation response
   */
  private async handleAnimeConfirmation(
    userId: PlatformUserId,
    isAnime: boolean
  ): Promise<MessageResponse> {
    const media = this.services.session.getSelectedMedia(userId);

    if (!media) {
      this.services.session.resetSession(userId);
      return { text: this.config.messages.nothingSelected };
    }

    // Check quota before adding
    const quotaCheck = this.services.user.checkQuota(
      userId,
      media.mediaType === 'movie' ? 'movie' : 'tv_show'
    );

    if (!quotaCheck.allowed) {
      this.services.session.resetSession(userId);
      return { text: `${EMOJI.warning} ${formatMessage(this.config.messages.quotaExceeded, { quotaMessage: quotaCheck.message })}` };
    }

    // Update the anime status and proceed to add
    const updatedMedia: MediaSearchResult = {
      ...media,
      animeStatus: isAnime ? 'anime' : 'regular',
    };
    this.services.session.setSelectedMedia(userId, updatedMedia);

    return await this.addMediaToLibrary(userId, updatedMedia);
  }

  /**
   * Detect anime for a single media item and update its status
   */
  private async detectAnimeForMedia(
    media: MediaSearchResult,
    isAnimeRequest?: boolean
  ): Promise<MediaSearchResult> {
    // If user explicitly requested anime, mark as anime
    if (isAnimeRequest) {
      return { ...media, animeStatus: 'anime' };
    }

    // Can't detect anime for unknown media types
    if (media.mediaType === 'unknown') {
      return { ...media, animeStatus: 'unknown' };
    }

    // Detect anime via TMDB
    try {
      const detection = await this.services.tmdb.detectAnime(media.id, media.mediaType);
      return { ...media, animeStatus: detection as AnimeStatus };
    } catch {
      return { ...media, animeStatus: 'unknown' };
    }
  }

  /**
   * Add media to library with appropriate anime config
   */
  private async addMediaToLibrary(
    userId: PlatformUserId,
    media: MediaSearchResult
  ): Promise<MessageResponse> {
    const isAnime = media.animeStatus === 'anime';
    const session = this.services.session.getSession(userId);
    const monitorType = (session.context?.monitorType as string) || 'all';

    try {
      let arrId: number | undefined;
      let tvdbId: number | undefined;

      if (media.mediaType === 'movie') {
        const options = this.getRadarrOptions(isAnime);
        const result = await this.services.radarr.addMovie(media, options);
        arrId = result?.id;
      } else {
        // TV shows need TVDB ID for Sonarr
        tvdbId = (await this.services.tmdb.getTvdbId(media.id)) ?? undefined;
        if (!tvdbId) {
          this.services.session.resetSession(userId);
          return {
            text: `${EMOJI.warning} ${formatMessage(this.config.messages.tvdbNotFound, { title: media.title })}`,
          };
        }
        const sonarrMedia = { ...media, id: tvdbId };
        const options = { ...this.getSonarrOptions(isAnime), monitor: monitorType };
        const result = await this.services.sonarr.addSeries(sonarrMedia, options);
        arrId = result?.id;
      }

      // Record request for download notification tracking
      this.services.mediaRequest.recordRequest(
        media.mediaType === 'movie' ? 'movie' : 'tv_show',
        media.title,
        media.year ?? null,
        media.id, // TMDB ID
        userId,
        {
          tvdbId,
          radarrId: media.mediaType === 'movie' ? arrId : undefined,
          sonarrId: media.mediaType !== 'movie' ? arrId : undefined,
        }
      );

      // Increment user's request count for quotas
      this.services.user.incrementRequestCount(
        userId,
        media.mediaType === 'movie' ? 'movie' : 'tv_show'
      );

      // Send notification to all admins
      await this.notifyAdmins(userId, media);

      this.services.session.resetSession(userId);
      return this.formatAddedMessage(media, isAnime);
    } catch (error) {
      this.logger.error({ error, media }, 'Failed to add media');
      this.services.session.resetSession(userId);

      const errorMessage = String(error);
      if (errorMessage.includes('already') || errorMessage.includes('exists')) {
        return { text: this.formatAlreadyInLibrary(media) };
      }

      return { text: `${EMOJI.warning} ${formatMessage(this.config.messages.failedToAdd, { title: media.title })}` };
    }
  }

  /**
   * Send notification to all admins about a new request
   */
  private async notifyAdmins(userId: PlatformUserId, media: MediaSearchResult): Promise<void> {
    // Check if notifications are enabled
    if (!this.config.notifications?.enabled) {
      return;
    }

    const platforms = this.config.notifications?.platforms || ['sms'];
    const user = this.services.user.getUser(userId);
    const admins = this.services.user.getAdmins();

    const emoji = getMediaEmoji(media.mediaType);
    const year = media.year ? ` (${media.year})` : '';
    const userName = user?.name || 'Unknown';
    const title = `${emoji} ${media.title}${year}`;
    const message = `${EMOJI.mail} ${formatMessage(this.config.messages.adminNotification, { userName, title })}`;

    const notifications: Promise<void>[] = [];

    for (const admin of admins) {
      // Send via each configured platform
      for (const platform of platforms) {
        const identity = admin.identities?.[platform as keyof typeof admin.identities];
        if (!identity) continue;

        // Skip if this is the requesting user on this platform
        if (`${platform}:${identity}` === userId) continue;

        notifications.push(
          (async () => {
            try {
              if (platform === 'sms' && this.config.twilio?.enabled) {
                await this.services.twilio.sendMessage(identity, message);
                this.logger.debug({ platform, admin: identity }, 'Admin notification sent');
              } else if (platform !== 'sms') {
                // Log warning for platforms not yet implemented for admin notifications
                this.logger.warn({ platform, admin: identity }, 'Admin notification skipped - platform not implemented');
              }
            } catch (error) {
              this.logger.error({ error, platform, admin: identity }, 'Failed to send admin notification');
            }
          })()
        );
      }
    }

    await Promise.all(notifications);
  }

  /**
   * Get Sonarr options based on anime status
   */
  private getSonarrOptions(isAnime: boolean): {
    qualityProfileId?: number;
    rootFolder?: string;
    tags?: number[];
  } {
    if (isAnime && this.config.sonarr.animeRootFolder) {
      return {
        qualityProfileId:
          this.config.sonarr.animeQualityProfileId ?? this.config.sonarr.qualityProfileId,
        rootFolder: this.config.sonarr.animeRootFolder,
        tags: this.config.sonarr.animeTagIds,
      };
    }
    return {};
  }

  /**
   * Get Radarr options based on anime status
   */
  private getRadarrOptions(isAnime: boolean): {
    qualityProfileId?: number;
    rootFolder?: string;
    tags?: number[];
  } {
    if (isAnime && this.config.radarr.animeRootFolder) {
      return {
        qualityProfileId:
          this.config.radarr.animeQualityProfileId ?? this.config.radarr.qualityProfileId,
        rootFolder: this.config.radarr.animeRootFolder,
        tags: this.config.radarr.animeTagIds,
      };
    }
    return {};
  }

  /**
   * Check if user is admin (helper for admin commands)
   */
  private requireAdmin(userId: PlatformUserId): MessageResponse | null {
    if (!this.services.user.isAdmin(userId)) {
      return { text: `${EMOJI.warning} ${this.config.messages.adminOnly}` };
    }
    return null;
  }

  /**
   * Handle admin help command - show available admin commands
   */
  private handleAdminHelp(userId: PlatformUserId): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    return { text: `${EMOJI.crown} ${this.config.messages.adminHelpText}` };
  }

  /**
   * Handle admin list command
   */
  private handleAdminList(userId: PlatformUserId): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const users = this.services.user.getAllUsers();
    if (users.length === 0) {
      return { text: this.config.messages.noUsers };
    }

    const lines = ['Users:\n'];
    for (const user of users) {
      const adminBadge = user.isAdmin ? ` ${EMOJI.crown}` : '';
      const requests = `(${user.requestCount.movies}${EMOJI.movie} ${user.requestCount.tvShows}${EMOJI.tvShow})`;
      // Show all linked identities
      const identities: string[] = [];
      if (user.identities.sms) identities.push(`SMS:${user.identities.sms}`);
      if (user.identities.telegram) identities.push(`TG:${user.identities.telegram}`);
      if (user.identities.discord) identities.push(`DC:${user.identities.discord}`);
      if (user.identities.slack) identities.push(`SL:${user.identities.slack}`);
      const identityInfo = identities.length > 0 ? identities.join(' ') : user.id;
      lines.push(`• ${user.name}${adminBadge}\n  ${identityInfo} ${requests}`);
    }
    return { text: lines.join('\n') };
  }

  /**
   * Handle admin add command
   * Supports: admin add <platform:id> <name> or admin add <phone> <name>
   */
  private handleAdminAdd(userId: PlatformUserId, parsed: ParsedRequest): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const { targetPlatform, targetId, userName } = parsed.adminCommand || {};
    if (!targetPlatform || !targetId || !userName) {
      return { text: `${EMOJI.warning} Usage: admin add <platform:id> Name\nExamples:\n• admin add 5551234567 John\n• admin add telegram:123456789 Jane` };
    }

    // Check if user with this identity already exists
    const targetUserId = createPlatformUserId(targetPlatform, targetId);
    const existingUser = this.services.user.getUser(targetUserId);
    if (existingUser) {
      return { text: `${EMOJI.warning} User with ${targetPlatform}:${targetId} already exists.` };
    }

    try {
      const identities: Record<string, string> = { [targetPlatform]: targetId };
      this.services.user.addUser(userName, identities, userId);
      return { text: `${EMOJI.checkGreen} Added ${userName} (${targetPlatform}:${targetId}) to authorized users.` };
    } catch (error) {
      this.logger.error({ error, targetPlatform, targetId, userName }, 'Failed to add user');
      return { text: `${EMOJI.warning} Failed to add user. Please check the command format.` };
    }
  }

  /**
   * Handle admin remove command
   * Supports: admin remove <platform:id> or admin remove <phone>
   */
  private handleAdminRemove(userId: PlatformUserId, parsed: ParsedRequest): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const { targetPlatform, targetId } = parsed.adminCommand || {};
    if (!targetPlatform || !targetId) {
      return { text: `${EMOJI.warning} Usage: admin remove <platform:id>\nExamples:\n• admin remove 5551234567\n• admin remove telegram:123456789` };
    }

    const targetUserId = createPlatformUserId(targetPlatform, targetId);
    const user = this.services.user.getUser(targetUserId);
    if (!user) {
      return { text: `${EMOJI.warning} User ${targetPlatform}:${targetId} not found.` };
    }

    // Don't allow removing yourself
    if (targetUserId === userId) {
      return { text: `${EMOJI.warning} You can't remove yourself.` };
    }

    this.services.user.removeUser(user.id);
    return { text: `${EMOJI.checkGreen} Removed ${user.name} from authorized users.` };
  }

  /**
   * Handle admin promote command
   * Supports: admin promote <platform:id> or admin promote <phone>
   */
  private handleAdminPromote(userId: PlatformUserId, parsed: ParsedRequest): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const { targetPlatform, targetId } = parsed.adminCommand || {};
    if (!targetPlatform || !targetId) {
      return { text: `${EMOJI.warning} Usage: admin promote <platform:id>\nExamples:\n• admin promote 5551234567\n• admin promote telegram:123456789` };
    }

    const targetUserId = createPlatformUserId(targetPlatform, targetId);
    const user = this.services.user.getUser(targetUserId);
    if (!user) {
      return { text: `${EMOJI.warning} User ${targetPlatform}:${targetId} not found.` };
    }

    if (user.isAdmin) {
      return { text: `${user.name} is already an admin.` };
    }

    this.services.user.promoteToAdmin(user.id);
    return { text: `${EMOJI.checkGreen} ${user.name} is now an admin.` };
  }

  /**
   * Handle admin demote command
   * Supports: admin demote <platform:id> or admin demote <phone>
   */
  private handleAdminDemote(userId: PlatformUserId, parsed: ParsedRequest): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const { targetPlatform, targetId } = parsed.adminCommand || {};
    if (!targetPlatform || !targetId) {
      return { text: `${EMOJI.warning} Usage: admin demote <platform:id>\nExamples:\n• admin demote 5551234567\n• admin demote telegram:123456789` };
    }

    const targetUserId = createPlatformUserId(targetPlatform, targetId);

    // Don't allow demoting yourself
    if (targetUserId === userId) {
      return { text: `${EMOJI.warning} You can't demote yourself.` };
    }

    const user = this.services.user.getUser(targetUserId);
    if (!user) {
      return { text: `${EMOJI.warning} User ${targetPlatform}:${targetId} not found.` };
    }

    if (!user.isAdmin) {
      return { text: `${user.name} is not an admin.` };
    }

    this.services.user.demoteFromAdmin(user.id);
    return { text: `${EMOJI.checkGreen} ${user.name} is no longer an admin.` };
  }

  /**
   * Handle admin quota command
   * Supports: admin quota <platform:id> <type> <amount> or admin quota <phone> <type> <amount>
   */
  private handleAdminQuota(userId: PlatformUserId, parsed: ParsedRequest): MessageResponse {
    const notAdmin = this.requireAdmin(userId);
    if (notAdmin) return notAdmin;

    const { targetPlatform, targetId, mediaType, quotaAmount } = parsed.adminCommand || {};
    if (!targetPlatform || !targetId || !mediaType || quotaAmount === undefined) {
      return { text: `${EMOJI.warning} Usage: admin quota <platform:id> movies +5\nExamples:\n• admin quota 5551234567 movies +5\n• admin quota telegram:123456789 tv +3` };
    }

    const targetUserId = createPlatformUserId(targetPlatform, targetId);
    const user = this.services.user.getUser(targetUserId);
    if (!user) {
      return { text: `${EMOJI.warning} User ${targetPlatform}:${targetId} not found.` };
    }

    this.services.user.addQuota(user.id, mediaType, quotaAmount);
    const typeLabel = mediaType === 'movie' ? 'movie' : 'TV show';
    return { text: `${EMOJI.checkGreen} Added ${quotaAmount} ${typeLabel} requests to ${user.name}'s quota.` };
  }

  /**
   * Get help message
   */
  private getHelpMessage(isAdmin: boolean = false): string {
    let help = `${EMOJI.phone} ${this.config.messages.helpText}`;

    if (isAdmin) {
      help += `\n\n${EMOJI.crown} ${this.config.messages.adminHelpText}`;
    }

    return help;
  }

  /**
   * Check if a platform should respond to unregistered users
   */
  private getPlatformRespondToUnregistered(platform: Platform): boolean {
    switch (platform) {
      case 'telegram':
        return this.config.telegram.respondToUnregistered;
      case 'discord':
        return this.config.discord.respondToUnregistered;
      case 'slack':
        return this.config.slack.respondToUnregistered;
      default:
        return false;
    }
  }

  /**
   * Handle a recommendation request
   */
  private async handleRecommendationRequest(
    userId: PlatformUserId,
    parsed: ParsedRequest
  ): Promise<MessageResponse> {
    const params = parsed.recommendationParams ?? {
      type: 'popular' as const,
      mediaType: 'any' as const,
      genre: null,
      similarTo: null,
      timeWindow: null,
      keyword: null,
      year: null,
      decade: null,
      minRating: null,
      provider: null,
      network: null,
    };

    this.logger.info({ params }, 'Processing recommendation request');

    try {
      let results: MediaSearchResult[] = [];
      let label: string;

      switch (params.type) {
        case 'trending':
          ({ results, label } = await this.fetchTrendingRecommendations(params));
          break;

        case 'popular':
          ({ results, label } = await this.fetchPopularRecommendations(params));
          break;

        case 'top_rated':
          ({ results, label } = await this.fetchTopRatedRecommendations(params));
          break;

        case 'new_releases':
          ({ results, label } = await this.fetchNewReleasesRecommendations(params));
          break;

        case 'upcoming':
          results = await this.services.tmdb.getUpcoming();
          label = 'Upcoming Movies';
          break;

        case 'airing_today':
          results = await this.services.tmdb.getAiringToday();
          label = 'Airing Today';
          break;

        case 'genre':
          ({ results, label } = await this.fetchGenreRecommendations(params));
          break;

        case 'similar':
          if (!params.similarTo) {
            return { text: `${EMOJI.warning} What title would you like similar recommendations for?\n\nTry: "Something like Breaking Bad"` };
          }
          results = await this.services.tmdb.getSimilarTo(params.similarTo);
          label = `Similar to "${params.similarTo}"`;
          break;

        case 'keyword':
          ({ results, label } = await this.fetchKeywordRecommendations(params));
          break;

        case 'by_year':
          ({ results, label } = await this.fetchByYearRecommendations(params));
          break;

        case 'by_provider':
          // Provider-based recommendations require watch region
          label = params.provider ? `On ${params.provider}` : 'Streaming Recommendations';
          results = []; // TODO: Implement when provider IDs are available
          break;

        case 'by_network':
          // Network-based recommendations
          label = params.network ? `${params.network} Shows` : 'Network Recommendations';
          results = []; // TODO: Implement when network IDs are available
          break;

        default:
          ({ results, label } = await this.fetchPopularRecommendations(params));
      }

      // Enrich with library status
      results = await this.enrichWithLibraryStatus(results);

      // Limit results
      results = results.slice(0, this.config.session.maxSearchResults);

      if (results.length === 0) {
        return { text: `${EMOJI.search} ${this.config.messages.noRecommendations}` };
      }

      // Store results in session and show selection prompt
      this.services.session.setPendingResults(userId, results);
      return { text: this.formatRecommendationPrompt(results, label) };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to fetch recommendations');
      return { text: `${EMOJI.warning} ${this.config.messages.genericError}` };
    }
  }

  /**
   * Fetch trending recommendations
   */
  private async fetchTrendingRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    const mediaType =
      params.mediaType === 'any'
        ? 'all'
        : params.mediaType === 'movie'
        ? 'movie'
        : 'tv';
    const timeWindow = params.timeWindow ?? 'week';

    const results = await this.services.tmdb.getTrending(mediaType, timeWindow);
    const label = `Trending ${this.getMediaTypeLabel(params.mediaType)}`;

    return { results, label };
  }

  /**
   * Fetch popular recommendations
   */
  private async fetchPopularRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    if (params.mediaType === 'any') {
      const [movies, shows] = await Promise.all([
        this.services.tmdb.getPopular('movie'),
        this.services.tmdb.getPopular('tv'),
      ]);
      return {
        results: this.interleaveResults(movies, shows),
        label: 'Popular Content',
      };
    }

    const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv';
    const results = await this.services.tmdb.getPopular(mediaType);
    const label = `Popular ${this.getMediaTypeLabel(params.mediaType)}`;

    return { results, label };
  }

  /**
   * Fetch top rated recommendations
   */
  private async fetchTopRatedRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    if (params.mediaType === 'any') {
      const [movies, shows] = await Promise.all([
        this.services.tmdb.getTopRated('movie'),
        this.services.tmdb.getTopRated('tv'),
      ]);
      return {
        results: this.interleaveResults(movies, shows),
        label: 'Top Rated',
      };
    }

    const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv';
    const results = await this.services.tmdb.getTopRated(mediaType);
    const label = `Top Rated ${this.getMediaTypeLabel(params.mediaType)}`;

    return { results, label };
  }

  /**
   * Fetch new releases recommendations
   */
  private async fetchNewReleasesRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    if (params.mediaType === 'any') {
      const [movies, shows] = await Promise.all([
        this.services.tmdb.getNowPlaying(),
        this.services.tmdb.getOnTheAir(),
      ]);
      return {
        results: this.interleaveResults(movies, shows),
        label: 'New Releases',
      };
    }

    if (params.mediaType === 'movie') {
      const results = await this.services.tmdb.getNowPlaying();
      return { results, label: 'New Movies' };
    }

    const results = await this.services.tmdb.getOnTheAir();
    return { results, label: 'New TV Shows' };
  }

  /**
   * Fetch genre-based recommendations
   */
  private async fetchGenreRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    const genre = params.genre ?? 'drama';
    const genreLabel = this.capitalizeGenre(genre);

    // Build date filters for decade/year
    const dateFilters = this.buildDateFilters(params);

    if (params.mediaType === 'any') {
      const movieGenreId = this.services.tmdb.getGenreId(genre, 'movie');
      const tvGenreId = this.services.tmdb.getGenreId(genre, 'tv');

      const [movies, shows] = await Promise.all([
        movieGenreId
          ? this.services.tmdb.discover({
              mediaType: 'movie',
              genreId: movieGenreId,
              minVoteCount: 50,
              minVoteAverage: params.minRating ?? undefined,
              ...dateFilters.movie,
            })
          : Promise.resolve([]),
        tvGenreId
          ? this.services.tmdb.discover({
              mediaType: 'tv',
              genreId: tvGenreId,
              minVoteCount: 20,
              minVoteAverage: params.minRating ?? undefined,
              ...dateFilters.tv,
            })
          : Promise.resolve([]),
      ]);

      return {
        results: this.interleaveResults(movies, shows),
        label: this.buildGenreLabel(genreLabel, params),
      };
    }

    const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv';
    const genreId = this.services.tmdb.getGenreId(genre, mediaType);

    if (!genreId) {
      // Fallback to popular if genre not found
      return this.fetchPopularRecommendations(params);
    }

    const results = await this.services.tmdb.discover({
      mediaType,
      genreId,
      minVoteCount: mediaType === 'movie' ? 50 : 20,
      minVoteAverage: params.minRating ?? undefined,
      ...(mediaType === 'movie' ? dateFilters.movie : dateFilters.tv),
    });

    return {
      results,
      label: this.buildGenreLabel(genreLabel, params),
    };
  }

  /**
   * Fetch keyword-based recommendations
   */
  private async fetchKeywordRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    const keyword = params.keyword;
    if (!keyword) {
      return this.fetchPopularRecommendations(params);
    }

    // Search for the keyword ID first
    const keywords = await this.services.tmdb.searchKeywords(keyword);
    if (keywords.length === 0) {
      this.logger.warn({ keyword }, 'No keyword found, falling back to popular');
      return this.fetchPopularRecommendations(params);
    }

    const keywordIds = keywords.slice(0, 3).map((k) => k.id);
    const keywordLabel = this.capitalizeGenre(keyword);

    if (params.mediaType === 'any') {
      const [movies, shows] = await Promise.all([
        this.services.tmdb.discover({ mediaType: 'movie', keywordIds, minVoteCount: 20 }),
        this.services.tmdb.discover({ mediaType: 'tv', keywordIds, minVoteCount: 10 }),
      ]);

      return {
        results: this.interleaveResults(movies, shows),
        label: `${keywordLabel} Content`,
      };
    }

    const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv';
    const results = await this.services.tmdb.discover({
      mediaType,
      keywordIds,
      minVoteCount: mediaType === 'movie' ? 20 : 10,
    });

    return {
      results,
      label: `${keywordLabel} ${this.getMediaTypeLabel(params.mediaType)}`,
    };
  }

  /**
   * Fetch by year/decade recommendations
   */
  private async fetchByYearRecommendations(
    params: RecommendationParams
  ): Promise<{ results: MediaSearchResult[]; label: string }> {
    const dateFilters = this.buildDateFilters(params);
    const yearLabel = params.year
      ? `${params.year}`
      : params.decade
      ? `${params.decade}`
      : 'Recent';

    if (params.mediaType === 'any') {
      const [movies, shows] = await Promise.all([
        this.services.tmdb.discover({
          mediaType: 'movie',
          minVoteCount: 50,
          ...dateFilters.movie,
        }),
        this.services.tmdb.discover({
          mediaType: 'tv',
          minVoteCount: 20,
          ...dateFilters.tv,
        }),
      ]);

      return {
        results: this.interleaveResults(movies, shows),
        label: `${yearLabel} Content`,
      };
    }

    const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv';
    const results = await this.services.tmdb.discover({
      mediaType,
      minVoteCount: mediaType === 'movie' ? 50 : 20,
      ...(mediaType === 'movie' ? dateFilters.movie : dateFilters.tv),
    });

    return {
      results,
      label: `${yearLabel} ${this.getMediaTypeLabel(params.mediaType)}`,
    };
  }

  /**
   * Build date filters from params
   */
  private buildDateFilters(params: RecommendationParams): {
    movie: { releaseDateGte?: string; releaseDateLte?: string };
    tv: { releaseDateGte?: string; releaseDateLte?: string };
  } {
    const result = {
      movie: {} as { releaseDateGte?: string; releaseDateLte?: string },
      tv: {} as { releaseDateGte?: string; releaseDateLte?: string },
    };

    if (params.year) {
      const yearStr = params.year.toString();
      result.movie.releaseDateGte = `${yearStr}-01-01`;
      result.movie.releaseDateLte = `${yearStr}-12-31`;
      result.tv.releaseDateGte = `${yearStr}-01-01`;
      result.tv.releaseDateLte = `${yearStr}-12-31`;
    } else if (params.decade) {
      const decadeMatch = params.decade.match(/(\d{2})s?/i);
      if (decadeMatch) {
        const decadeNum = parseInt(decadeMatch[1]!, 10);
        const startYear = decadeNum < 30 ? 2000 + decadeNum : 1900 + decadeNum;
        const endYear = startYear + 9;
        result.movie.releaseDateGte = `${startYear}-01-01`;
        result.movie.releaseDateLte = `${endYear}-12-31`;
        result.tv.releaseDateGte = `${startYear}-01-01`;
        result.tv.releaseDateLte = `${endYear}-12-31`;
      }
    }

    return result;
  }

  /**
   * Build genre label with optional year/decade
   */
  private buildGenreLabel(genreLabel: string, params: RecommendationParams): string {
    const parts = [];
    if (params.decade) parts.push(params.decade);
    if (params.year) parts.push(params.year.toString());
    parts.push(genreLabel);
    parts.push(this.getMediaTypeLabel(params.mediaType));
    return parts.join(' ');
  }

  /**
   * Interleave two result arrays (alternating items)
   */
  private interleaveResults(
    arr1: MediaSearchResult[],
    arr2: MediaSearchResult[]
  ): MediaSearchResult[] {
    const result: MediaSearchResult[] = [];
    const maxLen = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < arr1.length) result.push(arr1[i]!);
      if (i < arr2.length) result.push(arr2[i]!);
    }

    return result;
  }

  /**
   * Get display label for media type preference
   */
  private getMediaTypeLabel(mediaType: 'movie' | 'tv_show' | 'any'): string {
    switch (mediaType) {
      case 'movie':
        return 'Movies';
      case 'tv_show':
        return 'Shows';
      default:
        return 'Content';
    }
  }

  /**
   * Capitalize genre name for display
   */
  private capitalizeGenre(genre: string): string {
    return genre
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format recommendation results prompt
   */
  private formatRecommendationPrompt(
    results: MediaSearchResult[],
    label: string
  ): string {
    const lines = [`${EMOJI.star} ${label}:\n`];

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

      lines.push(
        `${index + 1}. ${emoji} ${result.title}${year}${rating}${statusIndicator}`
      );
    });

    lines.push(`\n${this.config.messages.selectPrompt}`);
    return lines.join('\n');
  }
}
