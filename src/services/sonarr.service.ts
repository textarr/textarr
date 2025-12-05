import type { Logger } from '../utils/logger.js';
import { MediaServiceError } from '../utils/errors.js';
import type { MediaSearchResult, SonarrSeries } from '../schemas/index.js';
import { BaseMediaService, type BaseMediaConfig } from './base-media.service.js';

export type SonarrConfig = BaseMediaConfig;

/**
 * Required fields for adding a series to Sonarr
 * Based on Addarr reference implementation
 */
const REQUIRED_FIELDS = ['tvdbId', 'title', 'titleSlug', 'images', 'seasons'] as const;

/**
 * Sonarr API client for managing TV shows
 */
export class SonarrService extends BaseMediaService {
  protected readonly serviceName = 'sonarr' as const;

  constructor(config: SonarrConfig, logger: Logger) {
    super(config, logger, 'sonarr');
  }

  /**
   * Search for TV shows by term
   */
  async search(term: string): Promise<MediaSearchResult[]> {
    this.logger.info({ term }, 'Searching for series');

    try {
      const [results, existingSeries] = await Promise.all([
        this.request<SonarrSeries[]>('GET', 'series/lookup', { params: { term } }),
        this.getAllSeries(),
      ]);

      const existingTvdbIds = new Set(existingSeries.map((s) => s.tvdbId));

      return results.map((series) => this.toSearchResult(series, existingTvdbIds.has(series.tvdbId)));
    } catch (error) {
      this.logger.error({ error, term }, 'Search failed');
      throw error;
    }
  }

  /**
   * Lookup a series by TVDB ID
   * This fetches fresh data from the API (like Addarr does before adding)
   */
  async lookupByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    this.logger.debug({ tvdbId }, 'Looking up series by TVDB ID');

    try {
      // Sonarr uses term=tvdb:{id} format for ID lookup
      const results = await this.request<SonarrSeries[]>('GET', 'series/lookup', {
        params: { term: `tvdb:${tvdbId}` },
      });

      return results[0] ?? null;
    } catch (error) {
      this.logger.error({ error, tvdbId }, 'TVDB lookup failed');
      return null;
    }
  }

  /**
   * Get all series in library
   */
  async getAllSeries(): Promise<SonarrSeries[]> {
    return this.request<SonarrSeries[]>('GET', 'series');
  }

  /**
   * Get a series from library by TVDB ID (efficient single lookup)
   * Returns null if series is not in library
   */
  async getSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const series = await this.request<SonarrSeries[]>('GET', 'series', {
      params: { tvdbId: String(tvdbId) },
    });
    return series[0] ?? null;
  }

  /**
   * Check if a series is in the library
   */
  async inLibrary(tvdbId: number): Promise<boolean> {
    const series = await this.getSeriesByTvdbId(tvdbId);
    return series !== null;
  }

  /**
   * Add a series to Sonarr
   *
   * Flow (matching Addarr reference):
   * 1. Re-lookup by TVDB ID to get fresh data
   * 2. Build the series data with required fields
   * 3. POST to /series endpoint
   */
  async addSeries(
    searchResult: MediaSearchResult,
    options?: {
      qualityProfileId?: number;
      rootFolder?: string;
      tags?: number[];
      monitor?: string;
      searchForMissing?: boolean;
    }
  ): Promise<SonarrSeries> {
    const tvdbId = searchResult.id;

    // Re-lookup by TVDB ID to get fresh, complete data (like Addarr does)
    this.logger.info({ tvdbId, title: searchResult.title }, 'Re-fetching series data before adding');
    const freshData = await this.lookupByTvdbId(tvdbId);

    if (!freshData) {
      throw new MediaServiceError('sonarr', `Could not find series with TVDB ID: ${tvdbId}`);
    }

    // Build series data with required fields
    const seriesData: Record<string, unknown> = {
      qualityProfileId: options?.qualityProfileId ?? this.qualityProfileId,
      rootFolderPath: options?.rootFolder ?? this.rootFolder,
      monitored: true,
      seasonFolder: true,
      tags: options?.tags ?? [],
      addOptions: {
        monitor: options?.monitor ?? 'all',
        searchForMissingEpisodes: options?.searchForMissing ?? true,
        searchForCutoffUnmetEpisodes: false,
      },
    };

    // Copy required fields from fresh API data
    for (const field of REQUIRED_FIELDS) {
      if (field in freshData) {
        seriesData[field] = freshData[field as keyof SonarrSeries];
      }
    }

    this.logger.info(
      { title: freshData.title, tvdbId: freshData.tvdbId },
      'Adding series to Sonarr'
    );

    return this.request<SonarrSeries>('POST', 'series', { body: seriesData });
  }

  /**
   * Convert Sonarr series to normalized search result
   */
  private toSearchResult(series: SonarrSeries, inLibrary: boolean): MediaSearchResult {
    return {
      id: series.tvdbId,
      title: series.title,
      year: series.year ?? null,
      overview: series.overview ?? null,
      posterUrl: series.remotePoster ?? null,
      mediaType: 'tv_show',
      status: series.status ?? null,
      inLibrary,
      seasonCount: series.statistics?.seasonCount ?? series.seasons?.length ?? null,
      runtime: null,
      rating: series.ratings?.value ?? null,
      rawData: series as unknown as Record<string, unknown>,
    };
  }
}
