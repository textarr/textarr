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
  status?: string;
  next_episode_to_air?: {
    air_date: string;
    episode_number: number;
    season_number: number;
    name: string;
  } | null;
  last_episode_to_air?: {
    air_date: string;
    episode_number: number;
    season_number: number;
    name: string;
  } | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  created_by?: { name: string }[];
}

/** Extended movie details for box office info */
interface TMDBMovieDetailsExtended extends TMDBMovieDetails {
  budget?: number;
  revenue?: number;
  runtime?: number;
  release_date?: string;
  tagline?: string;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
  } | null;
}

/** Credits response */
export interface TMDBCredits {
  id: number;
  cast: {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }[];
  crew: {
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }[];
}

/** Videos response */
export interface TMDBVideos {
  id: number;
  results: {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
  }[];
}

/** Watch providers response */
export interface TMDBWatchProviders {
  id: number;
  results: Record<string, {
    link?: string;
    flatrate?: { provider_id: number; provider_name: string; logo_path: string }[];
    rent?: { provider_id: number; provider_name: string; logo_path: string }[];
    buy?: { provider_id: number; provider_name: string; logo_path: string }[];
  }>;
}

/** Movie release dates (for certifications) */
export interface TMDBReleaseDates {
  id: number;
  results: {
    iso_3166_1: string;
    release_dates: {
      certification: string;
      type: number;
      release_date: string;
    }[];
  }[];
}

/** TV content ratings */
export interface TMDBContentRatings {
  id: number;
  results: {
    iso_3166_1: string;
    rating: string;
  }[];
}

/** Reviews response */
export interface TMDBReviews {
  id: number;
  results: {
    id: string;
    author: string;
    content: string;
    created_at: string;
    author_details: {
      rating: number | null;
    };
  }[];
  total_results: number;
}

/** Collection response */
export interface TMDBCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  parts: {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
    vote_average: number;
  }[];
}

/** Animation genre ID in TMDB (same for movies and TV) */
const ANIMATION_GENRE_ID = 16;

/** Movie genre IDs from TMDB */
const MOVIE_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  science_fiction: 878,
  thriller: 53,
  tv_movie: 10770,
  war: 10752,
  western: 37,
};

/** TV genre IDs from TMDB (some differ from movies) */
const TV_GENRES: Record<string, number> = {
  action_adventure: 10759,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  kids: 10762,
  mystery: 9648,
  news: 10763,
  reality: 10764,
  sci_fi_fantasy: 10765,
  soap: 10766,
  talk: 10767,
  war_politics: 10768,
  western: 37,
};

/** Genre name aliases for normalization */
const GENRE_ALIASES: Record<string, string> = {
  scifi: 'science_fiction',
  'sci-fi': 'science_fiction',
  sf: 'science_fiction',
  'sci fi': 'science_fiction',
  'science fiction': 'science_fiction',
  romcom: 'comedy',
  'romantic comedy': 'comedy',
  action: 'action',
  horror: 'horror',
  comedy: 'comedy',
  drama: 'drama',
  thriller: 'thriller',
  mystery: 'mystery',
  romance: 'romance',
  fantasy: 'fantasy',
  animation: 'animation',
  documentary: 'documentary',
  crime: 'crime',
  western: 'western',
  war: 'war',
  family: 'family',
  history: 'history',
  music: 'music',
  adventure: 'adventure',
};

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
   * Get trending movies and/or TV shows
   *
   * @param mediaType - 'movie', 'tv', or 'all' for both
   * @param timeWindow - 'day' or 'week'
   */
  async getTrending(
    mediaType: 'movie' | 'tv' | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'week'
  ): Promise<MediaSearchResult[]> {
    this.logger.info({ mediaType, timeWindow }, 'Fetching trending content');

    try {
      const response = await this.get<TMDBSearchMultiResponse>(
        `/trending/${mediaType}/${timeWindow}`
      );

      // Filter out persons if mediaType was 'all'
      const mediaResults = response.results.filter(
        (r): r is TMDBSearchResult & { media_type: 'movie' | 'tv' } =>
          r.media_type === 'movie' || r.media_type === 'tv'
      );

      const results = mediaResults.map((r) => this.toSearchResult(r));

      this.logger.info(
        { mediaType, timeWindow, resultCount: results.length },
        'Trending fetch complete'
      );

      return results;
    } catch (error) {
      this.logger.error({ error, mediaType, timeWindow }, 'Failed to fetch trending');
      throw error;
    }
  }

  /**
   * Get popular movies or TV shows
   */
  async getPopular(mediaType: 'movie' | 'tv'): Promise<MediaSearchResult[]> {
    this.logger.info({ mediaType }, 'Fetching popular content');

    try {
      const endpoint = mediaType === 'movie' ? '/movie/popular' : '/tv/popular';
      const response = await this.get<TMDBSearchMultiResponse>(endpoint);

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: mediaType })
      );

      this.logger.info({ mediaType, resultCount: results.length }, 'Popular fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error, mediaType }, 'Failed to fetch popular');
      throw error;
    }
  }

  /**
   * Get top rated movies or TV shows
   */
  async getTopRated(mediaType: 'movie' | 'tv'): Promise<MediaSearchResult[]> {
    this.logger.info({ mediaType }, 'Fetching top rated content');

    try {
      const endpoint = mediaType === 'movie' ? '/movie/top_rated' : '/tv/top_rated';
      const response = await this.get<TMDBSearchMultiResponse>(endpoint);

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: mediaType })
      );

      this.logger.info({ mediaType, resultCount: results.length }, 'Top rated fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error, mediaType }, 'Failed to fetch top rated');
      throw error;
    }
  }

  /**
   * Get movies currently in theaters
   */
  async getNowPlaying(): Promise<MediaSearchResult[]> {
    this.logger.info('Fetching now playing movies');

    try {
      const response = await this.get<TMDBSearchMultiResponse>('/movie/now_playing');

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: 'movie' })
      );

      this.logger.info({ resultCount: results.length }, 'Now playing fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error }, 'Failed to fetch now playing');
      throw error;
    }
  }

  /**
   * Get upcoming movies
   */
  async getUpcoming(): Promise<MediaSearchResult[]> {
    this.logger.info('Fetching upcoming movies');

    try {
      const response = await this.get<TMDBSearchMultiResponse>('/movie/upcoming');

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: 'movie' })
      );

      this.logger.info({ resultCount: results.length }, 'Upcoming fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error }, 'Failed to fetch upcoming');
      throw error;
    }
  }

  /**
   * Get TV shows airing in the next 7 days
   */
  async getOnTheAir(): Promise<MediaSearchResult[]> {
    this.logger.info('Fetching TV on the air');

    try {
      const response = await this.get<TMDBSearchMultiResponse>('/tv/on_the_air');

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: 'tv' })
      );

      this.logger.info({ resultCount: results.length }, 'On the air fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error }, 'Failed to fetch on the air');
      throw error;
    }
  }

  /**
   * Get TV shows airing today
   */
  async getAiringToday(): Promise<MediaSearchResult[]> {
    this.logger.info('Fetching TV airing today');

    try {
      const response = await this.get<TMDBSearchMultiResponse>('/tv/airing_today');

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: 'tv' })
      );

      this.logger.info({ resultCount: results.length }, 'Airing today fetch complete');
      return results;
    } catch (error) {
      this.logger.error({ error }, 'Failed to fetch airing today');
      throw error;
    }
  }

  /**
   * Get recommendations for a specific media item
   *
   * @param tmdbId - TMDB ID of the source media
   * @param mediaType - 'movie' or 'tv'
   */
  async getRecommendations(
    tmdbId: number,
    mediaType: 'movie' | 'tv'
  ): Promise<MediaSearchResult[]> {
    this.logger.info({ tmdbId, mediaType }, 'Fetching recommendations');

    try {
      const endpoint =
        mediaType === 'movie'
          ? `/movie/${tmdbId}/recommendations`
          : `/tv/${tmdbId}/recommendations`;

      const response = await this.get<TMDBSearchMultiResponse>(endpoint);

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: mediaType })
      );

      this.logger.info(
        { tmdbId, mediaType, resultCount: results.length },
        'Recommendations fetch complete'
      );

      return results;
    } catch (error) {
      this.logger.error({ error, tmdbId, mediaType }, 'Failed to fetch recommendations');
      throw error;
    }
  }

  /**
   * Find similar content by searching for a title first, then getting recommendations
   *
   * @param title - Title to find similar content for
   */
  async getSimilarTo(title: string): Promise<MediaSearchResult[]> {
    this.logger.info({ title }, 'Finding similar content');

    // First search for the title
    const searchResults = await this.searchMulti(title);

    if (searchResults.length === 0) {
      this.logger.warn({ title }, 'No results found for similar search');
      return [];
    }

    // Use the top result
    const source = searchResults[0]!;
    const mediaType = source.mediaType === 'movie' ? 'movie' : 'tv';

    // Get recommendations for that title
    return this.getRecommendations(source.id, mediaType);
  }

  /**
   * Discover content with filters (genre, sort, vote average, etc.)
   */
  async discover(options: {
    mediaType: 'movie' | 'tv';
    genreId?: number;
    keywordIds?: number[];
    sortBy?:
      | 'popularity.desc'
      | 'vote_average.desc'
      | 'primary_release_date.desc'
      | 'first_air_date.desc';
    minVoteCount?: number;
    minVoteAverage?: number;
    releaseDateGte?: string;
    releaseDateLte?: string;
    watchProviders?: number[];
    networks?: number[];
    watchRegion?: string;
  }): Promise<MediaSearchResult[]> {
    const { mediaType, genreId, keywordIds, sortBy, minVoteCount, minVoteAverage, releaseDateGte, releaseDateLte, watchProviders, networks, watchRegion } = options;

    this.logger.info({ options }, 'Discovering content');

    const params: Record<string, string | number | boolean> = {
      sort_by: sortBy ?? 'popularity.desc',
      include_adult: false,
    };

    if (genreId) params.with_genres = genreId;
    if (keywordIds?.length) params.with_keywords = keywordIds.join(',');
    if (minVoteCount) params['vote_count.gte'] = minVoteCount;
    if (minVoteAverage) params['vote_average.gte'] = minVoteAverage;
    if (watchProviders?.length) params.with_watch_providers = watchProviders.join('|');
    if (watchRegion) params.watch_region = watchRegion;
    if (networks?.length) params.with_networks = networks.join('|');

    // Date filters differ by media type
    if (mediaType === 'movie') {
      if (releaseDateGte) params['primary_release_date.gte'] = releaseDateGte;
      if (releaseDateLte) params['primary_release_date.lte'] = releaseDateLte;
    } else {
      if (releaseDateGte) params['first_air_date.gte'] = releaseDateGte;
      if (releaseDateLte) params['first_air_date.lte'] = releaseDateLte;
    }

    try {
      const response = await this.get<TMDBSearchMultiResponse>(
        `/discover/${mediaType}`,
        params
      );

      const results = response.results.map((r) =>
        this.toSearchResult({ ...r, media_type: mediaType })
      );

      this.logger.info({ mediaType, resultCount: results.length }, 'Discovery complete');

      return results;
    } catch (error) {
      this.logger.error({ error, options }, 'Discovery failed');
      throw error;
    }
  }

  /**
   * Search for keywords by name
   */
  async searchKeywords(query: string): Promise<{ id: number; name: string }[]> {
    this.logger.info({ query }, 'Searching keywords');

    try {
      const response = await this.get<{
        page: number;
        results: { id: number; name: string }[];
        total_pages: number;
        total_results: number;
      }>('/search/keyword', { query });

      this.logger.info({ query, resultCount: response.results.length }, 'Keyword search complete');
      return response.results;
    } catch (error) {
      this.logger.error({ error, query }, 'Keyword search failed');
      throw error;
    }
  }

  // ============================================
  // NEW MEDIA INFO METHODS
  // ============================================

  /**
   * Get credits (cast and crew) for a movie or TV show
   */
  async getCredits(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<TMDBCredits> {
    this.logger.debug({ tmdbId, mediaType }, 'Fetching credits');

    // TV uses aggregate_credits for all seasons, movies use regular credits
    const endpoint = mediaType === 'movie'
      ? `/movie/${tmdbId}/credits`
      : `/tv/${tmdbId}/aggregate_credits`;

    return this.get<TMDBCredits>(endpoint);
  }

  /**
   * Get videos (trailers, teasers, etc.) for a movie or TV show
   */
  async getVideos(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<TMDBVideos> {
    this.logger.debug({ tmdbId, mediaType }, 'Fetching videos');

    const endpoint = mediaType === 'movie'
      ? `/movie/${tmdbId}/videos`
      : `/tv/${tmdbId}/videos`;

    return this.get<TMDBVideos>(endpoint);
  }

  /**
   * Get the official YouTube trailer URL for a movie or TV show
   * Returns null if no trailer found
   */
  async getTrailerUrl(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
    try {
      const videos = await this.getVideos(tmdbId, mediaType);

      // Prioritize: Official Trailer > Trailer > Teaser
      const trailer = videos.results.find(
        (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
      ) ?? videos.results.find(
        (v) => v.site === 'YouTube' && v.type === 'Trailer'
      ) ?? videos.results.find(
        (v) => v.site === 'YouTube' && v.type === 'Teaser'
      );

      if (trailer) {
        return `https://www.youtube.com/watch?v=${trailer.key}`;
      }

      return null;
    } catch (error) {
      this.logger.error({ error, tmdbId, mediaType }, 'Failed to get trailer');
      return null;
    }
  }

  /**
   * Get watch providers (streaming services) for a movie or TV show
   */
  async getWatchProviders(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    region: string = 'US'
  ): Promise<{
    flatrate: string[];
    rent: string[];
    buy: string[];
    link: string | null;
  }> {
    this.logger.debug({ tmdbId, mediaType, region }, 'Fetching watch providers');

    const endpoint = mediaType === 'movie'
      ? `/movie/${tmdbId}/watch/providers`
      : `/tv/${tmdbId}/watch/providers`;

    try {
      const response = await this.get<TMDBWatchProviders>(endpoint);
      const regionData = response.results[region];

      if (!regionData) {
        return { flatrate: [], rent: [], buy: [], link: null };
      }

      return {
        flatrate: regionData.flatrate?.map((p) => p.provider_name) ?? [],
        rent: regionData.rent?.map((p) => p.provider_name) ?? [],
        buy: regionData.buy?.map((p) => p.provider_name) ?? [],
        link: regionData.link ?? null,
      };
    } catch (error) {
      this.logger.error({ error, tmdbId, mediaType, region }, 'Failed to get watch providers');
      return { flatrate: [], rent: [], buy: [], link: null };
    }
  }

  /**
   * Get movie certification (PG-13, R, etc.)
   */
  async getMovieCertification(tmdbId: number, region: string = 'US'): Promise<string | null> {
    this.logger.debug({ tmdbId, region }, 'Fetching movie certification');

    try {
      const response = await this.get<TMDBReleaseDates>(`/movie/${tmdbId}/release_dates`);
      const regionData = response.results.find((r) => r.iso_3166_1 === region);

      if (!regionData) return null;

      // Find theatrical or digital release with certification
      const releaseWithCert = regionData.release_dates.find(
        (r) => r.certification && (r.type === 3 || r.type === 4) // 3=Theatrical, 4=Digital
      ) ?? regionData.release_dates.find((r) => r.certification);

      return releaseWithCert?.certification || null;
    } catch (error) {
      this.logger.error({ error, tmdbId, region }, 'Failed to get movie certification');
      return null;
    }
  }

  /**
   * Get TV content rating (TV-MA, TV-14, etc.)
   */
  async getTvContentRating(tmdbId: number, region: string = 'US'): Promise<string | null> {
    this.logger.debug({ tmdbId, region }, 'Fetching TV content rating');

    try {
      const response = await this.get<TMDBContentRatings>(`/tv/${tmdbId}/content_ratings`);
      const regionData = response.results.find((r) => r.iso_3166_1 === region);

      return regionData?.rating || null;
    } catch (error) {
      this.logger.error({ error, tmdbId, region }, 'Failed to get TV content rating');
      return null;
    }
  }

  /**
   * Get reviews for a movie or TV show
   */
  async getReviews(
    tmdbId: number,
    mediaType: 'movie' | 'tv'
  ): Promise<{ reviews: { author: string; content: string; rating: number | null }[]; total: number }> {
    this.logger.debug({ tmdbId, mediaType }, 'Fetching reviews');

    const endpoint = mediaType === 'movie'
      ? `/movie/${tmdbId}/reviews`
      : `/tv/${tmdbId}/reviews`;

    try {
      const response = await this.get<TMDBReviews>(endpoint);

      return {
        reviews: response.results.slice(0, 3).map((r) => ({
          author: r.author,
          content: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
          rating: r.author_details.rating,
        })),
        total: response.total_results,
      };
    } catch (error) {
      this.logger.error({ error, tmdbId, mediaType }, 'Failed to get reviews');
      return { reviews: [], total: 0 };
    }
  }

  /**
   * Get collection (movie franchise) details
   */
  async getCollection(collectionId: number): Promise<TMDBCollection | null> {
    this.logger.debug({ collectionId }, 'Fetching collection');

    try {
      return await this.get<TMDBCollection>(`/collection/${collectionId}`);
    } catch (error) {
      this.logger.error({ error, collectionId }, 'Failed to get collection');
      return null;
    }
  }

  /**
   * Get extended movie details including box office info
   */
  async getMovieDetailsExtended(tmdbId: number): Promise<TMDBMovieDetailsExtended> {
    this.logger.debug({ tmdbId }, 'Fetching extended movie details');
    return this.get<TMDBMovieDetailsExtended>(`/movie/${tmdbId}`);
  }

  /**
   * Get TV details including next episode info
   */
  async getTvDetailsExtended(tmdbId: number): Promise<TMDBTvDetails> {
    this.logger.debug({ tmdbId }, 'Fetching extended TV details');
    return this.get<TMDBTvDetails>(`/tv/${tmdbId}`);
  }

  /**
   * Get TMDB genre ID for a genre name and media type
   */
  getGenreId(genre: string, mediaType: 'movie' | 'tv'): number | null {
    // Normalize the genre name
    const normalizedGenre = genre.toLowerCase().replace(/[\s-]/g, '_');

    // Check for aliases first
    const mappedGenre = GENRE_ALIASES[normalizedGenre] ?? normalizedGenre;

    // Look up in the appropriate genre map
    if (mediaType === 'movie') {
      const id = MOVIE_GENRES[mappedGenre];
      if (id) return id;

      // TV genres that map to movie equivalents
      if (mappedGenre === 'action_adventure') return MOVIE_GENRES.action ?? null;
      if (mappedGenre === 'sci_fi_fantasy') return MOVIE_GENRES.science_fiction ?? null;
      if (mappedGenre === 'war_politics') return MOVIE_GENRES.war ?? null;
    } else {
      const id = TV_GENRES[mappedGenre];
      if (id) return id;

      // Movie genres that map to TV equivalents
      if (mappedGenre === 'action') return TV_GENRES.action_adventure ?? null;
      if (mappedGenre === 'adventure') return TV_GENRES.action_adventure ?? null;
      if (mappedGenre === 'science_fiction') return TV_GENRES.sci_fi_fantasy ?? null;
      if (mappedGenre === 'fantasy') return TV_GENRES.sci_fi_fantasy ?? null;
      if (mappedGenre === 'war') return TV_GENRES.war_politics ?? null;
      if (mappedGenre === 'romance') return TV_GENRES.drama ?? null; // TV doesn't have romance
      if (mappedGenre === 'horror') return TV_GENRES.mystery ?? null; // Closest match
      if (mappedGenre === 'thriller') return TV_GENRES.crime ?? null; // Closest match
      if (mappedGenre === 'history') return TV_GENRES.documentary ?? null; // Closest match
    }

    this.logger.warn({ genre, normalizedGenre, mappedGenre, mediaType }, 'Unknown genre');
    return null;
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
