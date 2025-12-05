import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadarrService } from '../../src/services/radarr.service.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const mockConfig = {
  url: 'http://localhost:7878',
  apiKey: 'test-api-key',
  qualityProfileId: 1,
  rootFolder: '/movies',
};

describe('RadarrService', () => {
  let service: RadarrService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RadarrService(mockConfig, logger);
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('should return true when connection succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"version": "5.0"}'),
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7878/api/v3/system/status',
        expect.objectContaining({
          method: 'GET',
          headers: { 'X-Api-Key': 'test-api-key', 'Content-Type': 'application/json' },
        })
      );
    });

    it('should return false when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search for movies and mark existing ones', async () => {
      const lookupResponse = [
        { tmdbId: 123, title: 'Test Movie', year: 2020 },
        { tmdbId: 456, title: 'Another Movie', year: 2021 },
      ];
      const existingMovies = [{ tmdbId: 123, title: 'Test Movie' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(lookupResponse)),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(existingMovies)),
        });

      const results = await service.search('test');

      expect(results).toHaveLength(2);
      expect(results[0].inLibrary).toBe(true);
      expect(results[1].inLibrary).toBe(false);
    });

    it('should throw error when search fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      await expect(service.search('test')).rejects.toThrow();
    });
  });

  describe('lookupByTmdbId', () => {
    it('should return movie data for valid TMDB ID', async () => {
      const movieData = { tmdbId: 123, title: 'Test Movie' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(movieData)),
      });

      const result = await service.lookupByTmdbId(123);

      expect(result).toEqual(movieData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tmdbId=123'),
        expect.any(Object)
      );
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.lookupByTmdbId(123);

      expect(result).toBeNull();
    });
  });

  describe('getAllMovies', () => {
    it('should return all movies in library', async () => {
      const movies = [
        { tmdbId: 1, title: 'Movie 1' },
        { tmdbId: 2, title: 'Movie 2' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(movies)),
      });

      const result = await service.getAllMovies();

      expect(result).toEqual(movies);
    });
  });

  describe('inLibrary', () => {
    it('should return true if movie exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ tmdbId: 123 }])),
      });

      const result = await service.inLibrary(123);

      expect(result).toBe(true);
    });

    it('should return false if movie does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      });

      const result = await service.inLibrary(123);

      expect(result).toBe(false);
    });
  });

  describe('addMovie', () => {
    const mockSearchResult = {
      id: 123,
      title: 'Test Movie',
      year: 2020,
      overview: 'A test movie',
      posterUrl: null,
      mediaType: 'movie' as const,
      status: null,
      inLibrary: false,
      seasonCount: null,
      runtime: 120,
      rating: null,
      rawData: {},
    };

    it('should add movie with default options', async () => {
      const freshData = {
        tmdbId: 123,
        title: 'Test Movie',
        titleSlug: 'test-movie',
        images: [],
        year: 2020,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(freshData)),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, ...freshData })),
        });

      const result = await service.addMovie(mockSearchResult);

      expect(result).toHaveProperty('tmdbId', 123);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error if movie not found during lookup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await expect(service.addMovie(mockSearchResult)).rejects.toThrow(
        'Could not find movie with TMDB ID: 123'
      );
    });

    it('should use custom options when provided', async () => {
      const freshData = {
        tmdbId: 123,
        title: 'Test Movie',
        titleSlug: 'test-movie',
        images: [],
        year: 2020,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(freshData)),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, ...freshData })),
        });

      await service.addMovie(mockSearchResult, {
        qualityProfileId: 5,
        rootFolder: '/custom/path',
        tags: [1, 2],
        minimumAvailability: 'released',
        searchForMovie: false,
      });

      const postCall = mockFetch.mock.calls[1] as [string, { body: string }];
      const body = JSON.parse(postCall[1].body) as Record<string, unknown>;
      expect(body.qualityProfileId).toBe(5);
      expect(body.rootFolderPath).toBe('/custom/path');
      expect(body.tags).toEqual([1, 2]);
      expect(body.minimumAvailability).toBe('released');
      expect((body.addOptions as Record<string, unknown>).searchForMovie).toBe(false);
    });
  });

  describe('getQueue', () => {
    it('should return formatted queue items', async () => {
      const queueResponse = {
        records: [
          { title: 'Movie 1', status: 'downloading', size: 1000, sizeleft: 250, timeleft: '10:00' },
          { title: 'Movie 2', status: 'queued', size: 2000, sizeleft: 2000 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(queueResponse)),
      });

      const result = await service.getQueue();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Movie 1',
        status: 'downloading',
        progress: 75,
        timeLeft: '10:00',
      });
      expect(result[1]).toEqual({
        title: 'Movie 2',
        status: 'queued',
        progress: 0,
        timeLeft: undefined,
      });
    });
  });

  describe('getQualityProfiles', () => {
    it('should return quality profiles', async () => {
      const profiles = [
        { id: 1, name: 'HD-1080p' },
        { id: 2, name: '4K' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(profiles)),
      });

      const result = await service.getQualityProfiles();

      expect(result).toEqual(profiles);
    });
  });

  describe('getRootFolders', () => {
    it('should return root folders', async () => {
      const folders = [
        { id: 1, path: '/movies' },
        { id: 2, path: '/4k-movies' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(folders)),
      });

      const result = await service.getRootFolders();

      expect(result).toEqual(folders);
    });
  });

  describe('getTags', () => {
    it('should return tags', async () => {
      const tags = [
        { id: 1, label: 'requested' },
        { id: 2, label: 'radarr' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(tags)),
      });

      const result = await service.getTags();

      expect(result).toEqual(tags);
    });
  });
});
