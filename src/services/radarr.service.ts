import type { Logger } from '../utils/logger.js';
import { MediaServiceError } from '../utils/errors.js';
import type { MediaSearchResult, RadarrMovie } from '../schemas/index.js';
import { BaseMediaService, type BaseMediaConfig } from './base-media.service.js';

export type RadarrConfig = BaseMediaConfig;

/**
 * Required fields for adding a movie to Radarr
 * Based on Addarr reference implementation
 */
const REQUIRED_FIELDS = ['tmdbId', 'title', 'titleSlug', 'images', 'year'] as const;

/**
 * Radarr API client for managing movies
 */
export class RadarrService extends BaseMediaService {
  protected readonly serviceName = 'radarr' as const;

  constructor(config: RadarrConfig, logger: Logger) {
    super(config, logger, 'radarr');
  }

  /**
   * Search for movies by term
   */
  async search(term: string): Promise<MediaSearchResult[]> {
    this.logger.info({ term }, 'Searching for movie');

    try {
      const [results, existingMovies] = await Promise.all([
        this.request<RadarrMovie[]>('GET', 'movie/lookup', { params: { term } }),
        this.getAllMovies(),
      ]);

      const existingTmdbIds = new Set(existingMovies.map((m) => m.tmdbId));

      return results.map((movie) => this.toSearchResult(movie, existingTmdbIds.has(movie.tmdbId)));
    } catch (error) {
      this.logger.error({ error, term }, 'Search failed');
      throw error;
    }
  }

  /**
   * Lookup a movie by TMDB ID
   * This fetches fresh data from the API (like Addarr does before adding)
   */
  async lookupByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    this.logger.debug({ tmdbId }, 'Looking up movie by TMDB ID');

    try {
      // Radarr has a dedicated endpoint for TMDB lookup
      const result = await this.request<RadarrMovie>('GET', 'movie/lookup/tmdb', {
        params: { tmdbId: String(tmdbId) },
      });

      return result ?? null;
    } catch (error) {
      this.logger.error({ error, tmdbId }, 'TMDB lookup failed');
      return null;
    }
  }

  /**
   * Get all movies in library
   */
  async getAllMovies(): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>('GET', 'movie');
  }

  /**
   * Get a movie from library by TMDB ID (efficient single lookup)
   * Returns null if movie is not in library
   */
  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const movies = await this.request<RadarrMovie[]>('GET', 'movie', {
      params: { tmdbId: String(tmdbId) },
    });
    return movies[0] ?? null;
  }

  /**
   * Check if a movie is in the library
   */
  async inLibrary(tmdbId: number): Promise<boolean> {
    const movie = await this.getMovieByTmdbId(tmdbId);
    return movie !== null;
  }

  /**
   * Add a movie to Radarr
   *
   * Flow (matching Addarr reference):
   * 1. Re-lookup by TMDB ID to get fresh data
   * 2. Build the movie data with required fields
   * 3. POST to /movie endpoint
   */
  async addMovie(
    searchResult: MediaSearchResult,
    options?: {
      qualityProfileId?: number;
      rootFolder?: string;
      tags?: number[];
      minimumAvailability?: string;
      searchForMovie?: boolean;
    }
  ): Promise<RadarrMovie> {
    const tmdbId = searchResult.id;

    // Re-lookup by TMDB ID to get fresh, complete data (like Addarr does)
    this.logger.info({ tmdbId, title: searchResult.title }, 'Re-fetching movie data before adding');
    const freshData = await this.lookupByTmdbId(tmdbId);

    if (!freshData) {
      throw new MediaServiceError('radarr', `Could not find movie with TMDB ID: ${tmdbId}`);
    }

    // Build movie data with required fields
    const movieData: Record<string, unknown> = {
      qualityProfileId: options?.qualityProfileId ?? this.qualityProfileId,
      rootFolderPath: options?.rootFolder ?? this.rootFolder,
      monitored: true,
      minimumAvailability: options?.minimumAvailability ?? 'announced',
      tags: options?.tags ?? [],
      addOptions: {
        searchForMovie: options?.searchForMovie ?? true,
      },
    };

    // Copy required fields from fresh API data
    for (const field of REQUIRED_FIELDS) {
      if (field in freshData) {
        movieData[field] = freshData[field as keyof RadarrMovie];
      }
    }

    this.logger.info(
      { title: freshData.title, tmdbId: freshData.tmdbId },
      'Adding movie to Radarr'
    );

    return this.request<RadarrMovie>('POST', 'movie', { body: movieData });
  }

  /**
   * Convert Radarr movie to normalized search result
   */
  private toSearchResult(movie: RadarrMovie, inLibrary: boolean): MediaSearchResult {
    return {
      id: movie.tmdbId,
      title: movie.title,
      year: movie.year ?? null,
      overview: movie.overview ?? null,
      posterUrl: movie.remotePoster ?? null,
      mediaType: 'movie',
      status: movie.status ?? null,
      inLibrary,
      seasonCount: null,
      runtime: movie.runtime ?? null,
      rating: movie.ratings?.value ?? null,
      rawData: movie as unknown as Record<string, unknown>,
    };
  }
}
