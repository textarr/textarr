import type { Logger } from '../utils/logger.js';
import type { MediaSearchResult } from '../schemas/index.js';

export interface TMDBConfig {
  apiKey: string;
  language?: string;
}

interface TMDBSearchMultiResponse {
  page: number;
  results: TMDBSearchResult[];
  total_pages: number;
  total_results: number;
}

interface TMDBSearchResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  // Movie fields
  title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  first_air_date?: string;
  // Common fields
  poster_path: string | null;
  overview: string;
  vote_average: number;
  popularity: number;
}

interface TMDBExternalIds {
  id: number;
  tvdb_id: number | null;
  imdb_id: string | null;
  freebase_mid: string | null;
  freebase_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
  wikidata_id: string | null;
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBProductionCountry {
  iso_3166_1: string;
  name: string;
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  genres: TMDBGenre[];
  production_countries: TMDBProductionCountry[];
  origin_country?: string[];
}

interface TMDBTvDetails {
  id: number;
  name: string;
  genres: TMDBGenre[];
  origin_country: string[];
  production_countries?: TMDBProductionCountry[];
}

/** Animation genre ID in TMDB (same for movies and TV) */
const ANIMATION_GENRE_ID = 16;

/** Anime detection result */
export type AnimeDetectionResult = 'anime' | 'regular' | 'uncertain';

/**
 * TMDB API client for media search
 *
 * Uses TMDB multi-search to find movies and TV shows in a single API call.
 * This is the industry standard approach (used by Overseerr).
 */
export class TMDBService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.themoviedb.org/3';
  private readonly language: string;
  private readonly logger: Logger;

  constructor(config: TMDBConfig, logger: Logger) {
    if (!config.apiKey) {
      throw new Error('TMDB API key is required');
    }
    this.apiKey = config.apiKey;
    this.language = config.language ?? 'en';
    this.logger = logger.child({ service: 'tmdb' });
    this.logger.info('TMDB service initialized');
  }

  /**
   * Make a GET request to TMDB API with timeout
   * Uses Bearer token (recommended) with fallback to api_key query param (legacy)
   */
  private async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('language', this.language);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    this.logger.debug({ endpoint, params }, 'Making TMDB request');

    // Add 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Try Bearer token first (recommended for API Read Access Token)
      let response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      });

      // If Bearer fails with 401, try legacy api_key query param
      if (response.status === 401) {
        this.logger.debug('Bearer auth failed, trying api_key query param');
        url.searchParams.set('api_key', this.apiKey);
        response = await fetch(url.toString(), { signal: controller.signal });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        this.logger.error({ status: response.status, error: errorText }, 'TMDB request failed');
        throw new Error(`TMDB request failed: ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error({ endpoint }, 'TMDB request timed out after 10s');
        throw new Error('TMDB request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Multi-search for movies and TV shows
   *
   * Returns combined results with media_type field indicating movie or TV.
   * Filters out 'person' results as we only care about media.
   */
  async searchMulti(query: string, page = 1): Promise<MediaSearchResult[]> {
    this.logger.info({ query, page }, 'Searching TMDB');

    try {
      const response = await this.get<TMDBSearchMultiResponse>('/search/multi', {
        query,
        page,
        include_adult: false,
      });

      // Filter to only movies and TV shows, exclude persons
      const mediaResults = response.results.filter(
        (r): r is TMDBSearchResult & { media_type: 'movie' | 'tv' } =>
          r.media_type === 'movie' || r.media_type === 'tv'
      );

      const results = mediaResults.map((r) => this.toSearchResult(r));

      this.logger.info(
        { query, totalResults: response.total_results, returnedCount: results.length },
        'TMDB search complete'
      );

      return results;
    } catch (error) {
      this.logger.error({ error, query }, 'TMDB search failed');
      throw error;
    }
  }

  /**
   * Get external IDs for a TV show (needed for Sonarr which uses TVDB IDs)
   */
  async getTvExternalIds(tmdbId: number): Promise<TMDBExternalIds> {
    this.logger.debug({ tmdbId }, 'Fetching TV external IDs');

    try {
      const response = await this.get<TMDBExternalIds>(`/tv/${tmdbId}/external_ids`);
      this.logger.debug({ tmdbId, tvdbId: response.tvdb_id }, 'Got external IDs');
      return response;
    } catch (error) {
      this.logger.error({ error, tmdbId }, 'Failed to get external IDs');
      throw error;
    }
  }

  /**
   * Get TVDB ID for a TV show
   *
   * Sonarr requires TVDB IDs, but TMDB search returns TMDB IDs.
   * This method fetches the TVDB ID for a given TMDB TV show ID.
   */
  async getTvdbId(tmdbId: number): Promise<number | null> {
    try {
      const externalIds = await this.getTvExternalIds(tmdbId);
      return externalIds.tvdb_id;
    } catch {
      return null;
    }
  }

  /**
   * Test connection to TMDB API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use configuration endpoint as a simple health check
      await this.get<{ images: unknown }>('/configuration');
      this.logger.info('TMDB connection successful');
      return true;
    } catch (error) {
      this.logger.error({ error }, 'TMDB connection failed');
      return false;
    }
  }

  /**
   * Get detailed movie information including genres and production countries
   */
  async getMovieDetails(tmdbId: number): Promise<TMDBMovieDetails> {
    this.logger.debug({ tmdbId }, 'Fetching movie details');
    return this.get<TMDBMovieDetails>(`/movie/${tmdbId}`);
  }

  /**
   * Get detailed TV show information including genres and origin country
   */
  async getTvDetails(tmdbId: number): Promise<TMDBTvDetails> {
    this.logger.debug({ tmdbId }, 'Fetching TV details');
    return this.get<TMDBTvDetails>(`/tv/${tmdbId}`);
  }

  /**
   * Detect if media is anime based on TMDB metadata
   *
   * Detection logic:
   * - Animation genre + Japanese origin = anime
   * - Animation genre + non-Japanese origin = uncertain (could be anime like Castlevania)
   * - No animation genre = regular
   */
  async detectAnime(
    tmdbId: number,
    mediaType: 'movie' | 'tv_show'
  ): Promise<AnimeDetectionResult> {
    try {
      const details: {
        genres: TMDBGenre[];
        origin_country?: string[];
        production_countries?: TMDBProductionCountry[];
      } = mediaType === 'movie'
        ? await this.getMovieDetails(tmdbId)
        : await this.getTvDetails(tmdbId);

      const hasAnimation = details.genres.some((g) => g.id === ANIMATION_GENRE_ID);
      if (!hasAnimation) return 'regular';

      const isJapanese =
        details.origin_country?.includes('JP') ||
        details.production_countries?.some((c) => c.iso_3166_1 === 'JP');

      return isJapanese ? 'anime' : 'uncertain';
    } catch (error) {
      this.logger.error({ error, tmdbId, mediaType }, 'Failed to detect anime');
      return 'regular';
    }
  }

  /**
   * Convert TMDB result to normalized MediaSearchResult
   */
  private toSearchResult(
    result: TMDBSearchResult & { media_type: 'movie' | 'tv' }
  ): MediaSearchResult {
    const isMovie = result.media_type === 'movie';

    return {
      id: result.id, // TMDB ID
      title: isMovie ? result.title! : result.name!,
      year: this.extractYear(isMovie ? result.release_date : result.first_air_date),
      overview: result.overview || null,
      posterUrl: result.poster_path
        ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : null,
      mediaType: isMovie ? 'movie' : 'tv_show',
      status: null,
      inLibrary: false, // Will be enriched by message handler
      seasonCount: null,
      runtime: null,
      rating: result.vote_average || null,
      rawData: result as unknown as Record<string, unknown>,
    };
  }

  /**
   * Extract year from date string (YYYY-MM-DD format)
   */
  private extractYear(dateStr: string | undefined): number | null {
    if (!dateStr) return null;
    const year = parseInt(dateStr.substring(0, 4), 10);
    return isNaN(year) ? null : year;
  }
}
