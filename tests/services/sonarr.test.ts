import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SonarrService } from '../../src/services/sonarr.service.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const mockConfig = {
  url: 'http://localhost:8989',
  apiKey: 'test-api-key',
  qualityProfileId: 1,
  rootFolder: '/tv',
};

describe('SonarrService', () => {
  let service: SonarrService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new SonarrService(mockConfig, logger);
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
        text: () => Promise.resolve('{"version": "4.0"}'),
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8989/api/v3/system/status',
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
    it('should search for series and mark existing ones', async () => {
      const lookupResponse = [
        { tvdbId: 123, title: 'Test Show', year: 2020 },
        { tvdbId: 456, title: 'Another Show', year: 2021 },
      ];
      const existingSeries = [{ tvdbId: 123, title: 'Test Show' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(lookupResponse)),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(existingSeries)),
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

  describe('lookupByTvdbId', () => {
    it('should return series data for valid TVDB ID', async () => {
      const seriesData = { tvdbId: 123, title: 'Test Show' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([seriesData])),
      });

      const result = await service.lookupByTvdbId(123);

      expect(result).toEqual(seriesData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('term=tvdb%3A123'),
        expect.any(Object)
      );
    });

    it('should return null when series not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('[]'),
      });

      const result = await service.lookupByTvdbId(999);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.lookupByTvdbId(123);

      expect(result).toBeNull();
    });
  });

  describe('getAllSeries', () => {
    it('should return all series in library', async () => {
      const series = [
        { tvdbId: 1, title: 'Show 1' },
        { tvdbId: 2, title: 'Show 2' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(series)),
      });

      const result = await service.getAllSeries();

      expect(result).toEqual(series);
    });
  });

  describe('inLibrary', () => {
    it('should return true if series exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ tvdbId: 123 }])),
      });

      const result = await service.inLibrary(123);

      expect(result).toBe(true);
    });

    it('should return false if series does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      });

      const result = await service.inLibrary(123);

      expect(result).toBe(false);
    });
  });

  describe('addSeries', () => {
    const mockSearchResult = {
      id: 123,
      title: 'Test Show',
      year: 2020,
      overview: 'A test show',
      posterUrl: null,
      mediaType: 'tv_show' as const,
      status: null,
      inLibrary: false,
      seasonCount: 3,
      runtime: null,
      rating: null,
      rawData: {},
    };

    it('should add series with default options', async () => {
      const freshData = {
        tvdbId: 123,
        title: 'Test Show',
        titleSlug: 'test-show',
        images: [],
        seasons: [],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([freshData])),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, ...freshData })),
        });

      const result = await service.addSeries(mockSearchResult);

      expect(result).toHaveProperty('tvdbId', 123);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error if series not found during lookup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('[]'),
      });

      await expect(service.addSeries(mockSearchResult)).rejects.toThrow(
        'Could not find series with TVDB ID: 123'
      );
    });

    it('should use custom options when provided', async () => {
      const freshData = {
        tvdbId: 123,
        title: 'Test Show',
        titleSlug: 'test-show',
        images: [],
        seasons: [],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([freshData])),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, ...freshData })),
        });

      await service.addSeries(mockSearchResult, {
        qualityProfileId: 5,
        rootFolder: '/custom/path',
        tags: [1, 2],
        monitor: 'future',
        searchForMissing: false,
      });

      const postCall = mockFetch.mock.calls[1] as [string, { body: string }];
      const body = JSON.parse(postCall[1].body) as Record<string, unknown>;
      expect(body.qualityProfileId).toBe(5);
      expect(body.rootFolderPath).toBe('/custom/path');
      expect(body.tags).toEqual([1, 2]);
      expect((body.addOptions as Record<string, unknown>).monitor).toBe('future');
      expect((body.addOptions as Record<string, unknown>).searchForMissingEpisodes).toBe(false);
    });
  });

  describe('getQueue', () => {
    it('should return formatted queue items', async () => {
      const queueResponse = {
        records: [
          { title: 'Episode 1', status: 'downloading', size: 1000, sizeleft: 500, timeleft: '5:00' },
          { title: 'Episode 2', status: 'queued', size: 1000, sizeleft: 1000 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(queueResponse)),
      });

      const result = await service.getQueue();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Episode 1',
        status: 'downloading',
        progress: 50,
        timeLeft: '5:00',
      });
      expect(result[1]).toEqual({
        title: 'Episode 2',
        status: 'queued',
        progress: 0,
        timeLeft: undefined,
      });
    });
  });

  describe('getQualityProfiles', () => {
    it('should return quality profiles', async () => {
      const profiles = [
        { id: 1, name: 'HD' },
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
        { id: 1, path: '/tv' },
        { id: 2, path: '/anime' },
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
        { id: 1, label: 'anime' },
        { id: 2, label: 'requested' },
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
