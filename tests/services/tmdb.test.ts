import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TMDBService } from '../../src/services/tmdb.service.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TMDBService', () => {
  let tmdbService: TMDBService;

  beforeEach(() => {
    vi.clearAllMocks();
    tmdbService = new TMDBService(
      {
        apiKey: 'test-api-key',
        language: 'en',
      },
      logger
    );
  });

  describe('detectAnime', () => {
    it('should detect anime for Japanese animation TV show', async () => {
      // Mock the TV details response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Attack on Titan',
          genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }],
          origin_country: ['JP'],
        }),
      });

      const result = await tmdbService.detectAnime(1, 'tv_show');

      expect(result).toBe('anime');
    });

    it('should detect anime for Japanese animation movie', async () => {
      // Mock the movie details response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          title: 'Spirited Away',
          genres: [{ id: 16, name: 'Animation' }, { id: 14, name: 'Fantasy' }],
          production_countries: [{ iso_3166_1: 'JP', name: 'Japan' }],
        }),
      });

      const result = await tmdbService.detectAnime(1, 'movie');

      expect(result).toBe('anime');
    });

    it('should return uncertain for Western animation', async () => {
      // Mock the TV details response for US animation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Castlevania',
          genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }],
          origin_country: ['US'],
        }),
      });

      const result = await tmdbService.detectAnime(1, 'tv_show');

      expect(result).toBe('uncertain');
    });

    it('should return regular for non-animated content', async () => {
      // Mock the TV details response for live-action
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Breaking Bad',
          genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
          origin_country: ['US'],
        }),
      });

      const result = await tmdbService.detectAnime(1, 'tv_show');

      expect(result).toBe('regular');
    });

    it('should return regular for non-animated Japanese content', async () => {
      // Mock the TV details response for Japanese live-action
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Some Japanese Drama',
          genres: [{ id: 18, name: 'Drama' }],
          origin_country: ['JP'],
        }),
      });

      const result = await tmdbService.detectAnime(1, 'tv_show');

      expect(result).toBe('regular');
    });

    it('should return regular on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await tmdbService.detectAnime(1, 'tv_show');

      expect(result).toBe('regular');
    });
  });

  describe('constructor', () => {
    it('should throw error if API key is missing', () => {
      expect(() => {
        new TMDBService({ apiKey: '' }, logger);
      }).toThrow('TMDB API key is required');
    });
  });

  describe('getCredits', () => {
    it('should fetch movie credits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          cast: [
            { id: 1, name: 'Brad Pitt', character: 'Tyler Durden', profile_path: '/path.jpg', order: 0 },
            { id: 2, name: 'Edward Norton', character: 'The Narrator', profile_path: '/path2.jpg', order: 1 },
          ],
          crew: [
            { id: 3, name: 'David Fincher', job: 'Director', department: 'Directing', profile_path: '/path3.jpg' },
          ],
        }),
      });

      const result = await tmdbService.getCredits(550, 'movie');

      expect(result.cast).toHaveLength(2);
      expect(result.cast[0]!.name).toBe('Brad Pitt');
      expect(result.crew[0]!.job).toBe('Director');
    });

    it('should fetch TV aggregate credits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396,
          cast: [
            { id: 1, name: 'Bryan Cranston', character: 'Walter White', profile_path: '/path.jpg', order: 0 },
          ],
          crew: [],
        }),
      });

      const result = await tmdbService.getCredits(1396, 'tv');

      expect(result.cast[0]!.name).toBe('Bryan Cranston');
    });
  });

  describe('getTrailerUrl', () => {
    it('should return YouTube trailer URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [
            { id: '1', key: 'abc123', name: 'Official Trailer', site: 'YouTube', type: 'Trailer', official: true },
            { id: '2', key: 'def456', name: 'Teaser', site: 'YouTube', type: 'Teaser', official: false },
          ],
        }),
      });

      const result = await tmdbService.getTrailerUrl(550, 'movie');

      expect(result).toBe('https://www.youtube.com/watch?v=abc123');
    });

    it('should return null if no trailer found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [],
        }),
      });

      const result = await tmdbService.getTrailerUrl(550, 'movie');

      expect(result).toBeNull();
    });

    it('should fall back to non-official trailer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [
            { id: '1', key: 'xyz789', name: 'Trailer', site: 'YouTube', type: 'Trailer', official: false },
          ],
        }),
      });

      const result = await tmdbService.getTrailerUrl(550, 'movie');

      expect(result).toBe('https://www.youtube.com/watch?v=xyz789');
    });
  });

  describe('getWatchProviders', () => {
    it('should return streaming providers for region', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: {
            US: {
              link: 'https://tmdb.org/link',
              flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/logo.jpg' }],
              rent: [{ provider_id: 3, provider_name: 'Amazon', logo_path: '/logo2.jpg' }],
              buy: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/logo3.jpg' }],
            },
          },
        }),
      });

      const result = await tmdbService.getWatchProviders(550, 'movie', 'US');

      expect(result.flatrate).toContain('Netflix');
      expect(result.rent).toContain('Amazon');
      expect(result.buy).toContain('Apple TV');
    });

    it('should return empty arrays for unavailable region', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: {},
        }),
      });

      const result = await tmdbService.getWatchProviders(550, 'movie', 'XX');

      expect(result.flatrate).toEqual([]);
      expect(result.rent).toEqual([]);
      expect(result.buy).toEqual([]);
    });
  });

  describe('getMovieCertification', () => {
    it('should return movie certification', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { certification: 'R', type: 3, release_date: '1999-10-15' },
              ],
            },
          ],
        }),
      });

      const result = await tmdbService.getMovieCertification(550, 'US');

      expect(result).toBe('R');
    });

    it('should return null for missing region', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [],
        }),
      });

      const result = await tmdbService.getMovieCertification(550, 'US');

      expect(result).toBeNull();
    });
  });

  describe('getTvContentRating', () => {
    it('should return TV content rating', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396,
          results: [
            { iso_3166_1: 'US', rating: 'TV-MA' },
          ],
        }),
      });

      const result = await tmdbService.getTvContentRating(1396, 'US');

      expect(result).toBe('TV-MA');
    });
  });

  describe('getReviews', () => {
    it('should return reviews', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          results: [
            {
              id: '1',
              author: 'John',
              content: 'Great movie!',
              created_at: '2020-01-01',
              author_details: { rating: 8 },
            },
          ],
          total_results: 1,
        }),
      });

      const result = await tmdbService.getReviews(550, 'movie');

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0]!.author).toBe('John');
      expect(result.total).toBe(1);
    });
  });

  describe('getCollection', () => {
    it('should return collection details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 119,
          name: 'The Lord of the Rings Collection',
          overview: 'The trilogy',
          poster_path: '/poster.jpg',
          parts: [
            { id: 120, title: 'Fellowship', release_date: '2001-12-19', poster_path: '/1.jpg', vote_average: 8.4 },
            { id: 121, title: 'Two Towers', release_date: '2002-12-18', poster_path: '/2.jpg', vote_average: 8.3 },
          ],
        }),
      });

      const result = await tmdbService.getCollection(119);

      expect(result?.name).toBe('The Lord of the Rings Collection');
      expect(result?.parts).toHaveLength(2);
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await tmdbService.getCollection(119);

      expect(result).toBeNull();
    });
  });

  describe('getMovieDetailsExtended', () => {
    it('should return extended movie details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          title: 'Fight Club',
          budget: 63000000,
          revenue: 100853753,
          runtime: 139,
          release_date: '1999-10-15',
          genres: [{ id: 18, name: 'Drama' }],
          belongs_to_collection: null,
        }),
      });

      const result = await tmdbService.getMovieDetailsExtended(550);

      expect(result.budget).toBe(63000000);
      expect(result.revenue).toBe(100853753);
      expect(result.runtime).toBe(139);
    });
  });

  describe('getTvDetailsExtended', () => {
    it('should return extended TV details with next episode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396,
          name: 'Breaking Bad',
          status: 'Ended',
          number_of_seasons: 5,
          number_of_episodes: 62,
          genres: [{ id: 18, name: 'Drama' }],
          origin_country: ['US'],
          next_episode_to_air: null,
          last_episode_to_air: {
            air_date: '2013-09-29',
            episode_number: 16,
            season_number: 5,
            name: 'Felina',
          },
        }),
      });

      const result = await tmdbService.getTvDetailsExtended(1396);

      expect(result.status).toBe('Ended');
      expect(result.number_of_seasons).toBe(5);
      expect(result.last_episode_to_air?.name).toBe('Felina');
    });
  });
});
