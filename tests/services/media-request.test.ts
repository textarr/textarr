import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaRequestService } from '../../src/services/media-request.service.js';
import type { MediaRequest } from '../../src/config/index.js';
import type { PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// Mock the config storage module
vi.mock('../../src/config/storage.js', () => {
  let mockConfig: { mediaRequests: MediaRequest[] } = { mediaRequests: [] };
  return {
    loadConfig: vi.fn(() => mockConfig),
    saveConfig: vi.fn((config: { mediaRequests: MediaRequest[] }) => {
      mockConfig = config;
    }),
    _resetMock: () => {
      mockConfig = { mediaRequests: [] };
    },
    _setMockData: (data: MediaRequest[]) => {
      mockConfig = { mediaRequests: data };
    },
    _getMockData: () => mockConfig.mediaRequests,
  };
});

import { loadConfig, saveConfig, _resetMock, _setMockData, _getMockData } from '../../src/config/storage.js';

describe('MediaRequestService', () => {
  let service: MediaRequestService;

  beforeEach(() => {
    vi.clearAllMocks();
    (_resetMock as () => void)();
    service = new MediaRequestService(logger);
  });

  describe('recordRequest', () => {
    it('should create a new media request for movie', () => {
      const userId: PlatformUserId = 'sms:+1234567890';

      const request = service.recordRequest(
        'movie',
        'Inception',
        2010,
        27205,
        userId,
        { radarrId: 100 }
      );

      expect(request.id).toBeDefined();
      expect(request.mediaType).toBe('movie');
      expect(request.title).toBe('Inception');
      expect(request.year).toBe(2010);
      expect(request.tmdbId).toBe(27205);
      expect(request.requestedBy).toBe(userId);
      expect(request.status).toBe('pending');
      expect(request.radarrId).toBe(100);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('should create a new media request for TV show', () => {
      const userId: PlatformUserId = 'telegram:123456';

      const request = service.recordRequest(
        'tv_show',
        'Breaking Bad',
        2008,
        1396,
        userId,
        { tvdbId: 81189, sonarrId: 50 }
      );

      expect(request.mediaType).toBe('tv_show');
      expect(request.title).toBe('Breaking Bad');
      expect(request.tvdbId).toBe(81189);
      expect(request.sonarrId).toBe(50);
    });

    it('should handle null year', () => {
      const userId: PlatformUserId = 'sms:+1234567890';

      const request = service.recordRequest(
        'movie',
        'Untitled Project',
        null,
        99999,
        userId
      );

      expect(request.year).toBeNull();
    });
  });

  describe('findByArrId', () => {
    it('should find request by sonarr ID', () => {
      const existingRequest: MediaRequest = {
        id: 'req-123',
        mediaType: 'tv_show',
        title: 'Test Show',
        year: 2020,
        tmdbId: 1000,
        sonarrId: 42,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([existingRequest]);

      const found = service.findByArrId('sonarr', 42);

      expect(found).toBeDefined();
      expect(found?.title).toBe('Test Show');
    });

    it('should find request by radarr ID', () => {
      const existingRequest: MediaRequest = {
        id: 'req-456',
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2021,
        tmdbId: 2000,
        radarrId: 99,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([existingRequest]);

      const found = service.findByArrId('radarr', 99);

      expect(found).toBeDefined();
      expect(found?.title).toBe('Test Movie');
    });

    it('should return undefined when not found', () => {
      const found = service.findByArrId('sonarr', 9999);
      expect(found).toBeUndefined();
    });
  });

  describe('findByTmdbId', () => {
    it('should find request by TMDB ID', () => {
      const existingRequest: MediaRequest = {
        id: 'req-789',
        mediaType: 'movie',
        title: 'Test',
        year: 2020,
        tmdbId: 12345,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([existingRequest]);

      const found = service.findByTmdbId(12345);

      expect(found).toBeDefined();
      expect(found?.tmdbId).toBe(12345);
    });

    it('should filter by media type when specified', () => {
      const requests: MediaRequest[] = [
        {
          id: 'req-1',
          mediaType: 'movie',
          title: 'Movie',
          year: 2020,
          tmdbId: 100,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'req-2',
          mediaType: 'tv_show',
          title: 'Show',
          year: 2020,
          tmdbId: 100,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
      ];
      (_setMockData as (data: MediaRequest[]) => void)(requests);

      const movieFound = service.findByTmdbId(100, 'movie');
      const showFound = service.findByTmdbId(100, 'tv_show');

      expect(movieFound?.title).toBe('Movie');
      expect(showFound?.title).toBe('Show');
    });
  });

  describe('findPendingRequests', () => {
    it('should return pending and downloading requests', () => {
      const requests: MediaRequest[] = [
        {
          id: 'req-1',
          mediaType: 'movie',
          title: 'Pending Movie',
          year: 2020,
          tmdbId: 1,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'req-2',
          mediaType: 'tv_show',
          title: 'Downloading Show',
          year: 2021,
          tmdbId: 2,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'downloading',
        },
        {
          id: 'req-3',
          mediaType: 'movie',
          title: 'Completed Movie',
          year: 2019,
          tmdbId: 3,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'completed',
        },
      ];
      (_setMockData as (data: MediaRequest[]) => void)(requests);

      const pending = service.findPendingRequests();

      expect(pending).toHaveLength(2);
      expect(pending.map((r) => r.title)).toContain('Pending Movie');
      expect(pending.map((r) => r.title)).toContain('Downloading Show');
    });
  });

  describe('updateStatus', () => {
    it('should update request status', () => {
      const request: MediaRequest = {
        id: 'req-update',
        mediaType: 'movie',
        title: 'Test',
        year: 2020,
        tmdbId: 100,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([request]);

      const result = service.updateStatus('req-update', 'completed');

      expect(result).toBe(true);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('should return false when request not found', () => {
      const result = service.updateStatus('non-existent', 'completed');
      expect(result).toBe(false);
    });
  });

  describe('updateArrId', () => {
    it('should update sonarr ID', () => {
      const request: MediaRequest = {
        id: 'req-arr',
        mediaType: 'tv_show',
        title: 'Test Show',
        year: 2020,
        tmdbId: 100,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([request]);

      const result = service.updateArrId('req-arr', 'sonarr', 123);

      expect(result).toBe(true);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('should update radarr ID', () => {
      const request: MediaRequest = {
        id: 'req-arr',
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2020,
        tmdbId: 100,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([request]);

      const result = service.updateArrId('req-arr', 'radarr', 456);

      expect(result).toBe(true);
    });

    it('should return false when request not found', () => {
      const result = service.updateArrId('non-existent', 'sonarr', 123);
      expect(result).toBe(false);
    });
  });

  describe('getRequest', () => {
    it('should return request by ID', () => {
      const request: MediaRequest = {
        id: 'req-get',
        mediaType: 'movie',
        title: 'Get Test',
        year: 2020,
        tmdbId: 100,
        requestedBy: 'sms:+1234567890',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      (_setMockData as (data: MediaRequest[]) => void)([request]);

      const found = service.getRequest('req-get');

      expect(found).toBeDefined();
      expect(found?.title).toBe('Get Test');
    });

    it('should return undefined when not found', () => {
      const found = service.getRequest('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('getRequestsByUser', () => {
    it('should return all requests for a user', () => {
      const requests: MediaRequest[] = [
        {
          id: 'req-1',
          mediaType: 'movie',
          title: 'User1 Movie',
          year: 2020,
          tmdbId: 1,
          requestedBy: 'sms:+1111111111',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'req-2',
          mediaType: 'tv_show',
          title: 'User1 Show',
          year: 2021,
          tmdbId: 2,
          requestedBy: 'sms:+1111111111',
          requestedAt: new Date().toISOString(),
          status: 'completed',
        },
        {
          id: 'req-3',
          mediaType: 'movie',
          title: 'User2 Movie',
          year: 2022,
          tmdbId: 3,
          requestedBy: 'sms:+2222222222',
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
      ];
      (_setMockData as (data: MediaRequest[]) => void)(requests);

      const userId: PlatformUserId = 'sms:+1111111111';
      const userRequests = service.getRequestsByUser(userId);

      expect(userRequests).toHaveLength(2);
      expect(userRequests.every((r) => r.requestedBy === userId)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove completed requests older than threshold', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      const requests: MediaRequest[] = [
        {
          id: 'req-old',
          mediaType: 'movie',
          title: 'Old Completed',
          year: 2020,
          tmdbId: 1,
          requestedBy: 'sms:+1234567890',
          requestedAt: oldDate.toISOString(),
          status: 'completed',
        },
        {
          id: 'req-new',
          mediaType: 'movie',
          title: 'New Completed',
          year: 2021,
          tmdbId: 2,
          requestedBy: 'sms:+1234567890',
          requestedAt: new Date().toISOString(),
          status: 'completed',
        },
        {
          id: 'req-pending',
          mediaType: 'movie',
          title: 'Old Pending',
          year: 2019,
          tmdbId: 3,
          requestedBy: 'sms:+1234567890',
          requestedAt: oldDate.toISOString(),
          status: 'pending',
        },
      ];
      (_setMockData as (data: MediaRequest[]) => void)(requests);

      const removedCount = service.cleanup(30);

      expect(removedCount).toBe(1);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('should not save when nothing to clean', () => {
      (_setMockData as (data: MediaRequest[]) => void)([]);

      const removedCount = service.cleanup();

      expect(removedCount).toBe(0);
      // saveConfig should not be called when no changes
    });
  });
});
