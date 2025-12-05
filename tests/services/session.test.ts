import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionService } from '../../src/services/session.service.js';
import type { MediaSearchResult } from '../../src/schemas/index.js';
import type { PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('SessionService', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService(300000, logger);
  });

  afterEach(() => {
    sessionService.stop();
  });

  describe('getSession', () => {
    it('should create a new session for unknown user', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      const session = sessionService.getSession(userId);

      expect(session.userId).toBe('sms:+1234567890');
      expect(session.platform).toBe('sms');
      expect(session.state).toBe('idle');
      expect(session.pendingResults).toEqual([]);
      expect(session.selectedMedia).toBeNull();
    });

    it('should return existing session for known user', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      const session1 = sessionService.getSession(userId);
      session1.state = 'awaiting_confirmation';

      const session2 = sessionService.getSession(userId);

      expect(session2.state).toBe('awaiting_confirmation');
    });

    it('should create new session if expired', () => {
      vi.useFakeTimers();

      const userId: PlatformUserId = 'sms:+1234567890';
      const session1 = sessionService.getSession(userId);
      session1.state = 'awaiting_confirmation';

      // Fast forward past timeout
      vi.advanceTimersByTime(400000);

      const session2 = sessionService.getSession(userId);

      expect(session2.state).toBe('idle');

      vi.useRealTimers();
    });
  });

  describe('setState', () => {
    it('should update session state', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      sessionService.setState(userId, 'awaiting_selection');
      const session = sessionService.getSession(userId);

      expect(session.state).toBe('awaiting_selection');
    });
  });

  describe('setPendingResults', () => {
    it('should set pending results and update state', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      const results: MediaSearchResult[] = [
        {
          id: 1,
          title: 'Test Show',
          year: 2020,
          overview: 'A test show',
          posterUrl: null,
          mediaType: 'tv_show',
          status: 'continuing',
          inLibrary: false,
          seasonCount: 3,
          runtime: null,
          rating: 8.5,
          rawData: {},
        },
      ];

      sessionService.setPendingResults(userId, results);
      const session = sessionService.getSession(userId);

      expect(session.state).toBe('awaiting_selection');
      expect(session.pendingResults).toHaveLength(1);
      expect(session.pendingResults[0]?.title).toBe('Test Show');
    });
  });

  describe('setSelectedMedia', () => {
    it('should set selected media and update state', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      const media: MediaSearchResult = {
        id: 1,
        title: 'Test Movie',
        year: 2021,
        overview: 'A test movie',
        posterUrl: null,
        mediaType: 'movie',
        status: 'released',
        inLibrary: false,
        seasonCount: null,
        runtime: 120,
        rating: 7.5,
        rawData: {},
      };

      sessionService.setSelectedMedia(userId, media);
      const session = sessionService.getSession(userId);

      expect(session.state).toBe('awaiting_confirmation');
      expect(session.selectedMedia?.title).toBe('Test Movie');
    });
  });

  describe('resetSession', () => {
    it('should reset session to idle state', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      sessionService.setState(userId, 'awaiting_confirmation');
      sessionService.resetSession(userId);

      const session = sessionService.getSession(userId);

      expect(session.state).toBe('idle');
      expect(session.pendingResults).toEqual([]);
      expect(session.selectedMedia).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete the session', () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      sessionService.getSession(userId);
      sessionService.setState(userId, 'awaiting_confirmation');
      sessionService.deleteSession(userId);

      // Getting session after delete should create a new one
      const session = sessionService.getSession(userId);
      expect(session.state).toBe('idle');
    });
  });
});
