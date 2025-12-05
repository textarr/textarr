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
});
