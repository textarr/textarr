import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/services/notification.service.js';
import type { MediaRequest, User } from '../../src/config/index.js';
import type { PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('NotificationService', () => {
  let service: NotificationService;
  let mockUserService: {
    getUser: ReturnType<typeof vi.fn>;
  };
  let mockTwilioService: {
    sendMessage: ReturnType<typeof vi.fn>;
  };

  const defaultConfig = {
    enabled: true,
    webhookSecret: 'test-secret',
    messageTemplate: '{emoji} {title}{year} is ready!',
  };

  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-123',
    name: 'Test User',
    isAdmin: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    identities: { sms: '+1234567890' },
    requestCount: { movies: 0, tvShows: 0, lastReset: '2024-01-01T00:00:00.000Z' },
    notificationPreferences: { enabled: true },
    ...overrides,
  });

  const createMockRequest = (overrides: Partial<MediaRequest> = {}): MediaRequest => ({
    id: 'req-123',
    mediaType: 'movie',
    title: 'Test Movie',
    year: 2024,
    tmdbId: 12345,
    requestedBy: 'sms:+1234567890',
    requestedAt: '2024-01-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  });

  beforeEach(() => {
    mockUserService = {
      getUser: vi.fn(),
    };
    mockTwilioService = {
      sendMessage: vi.fn().mockResolvedValue('SM123'),
    };

    service = new NotificationService(defaultConfig, logger);
  });

  describe('isEnabled', () => {
    it('should return false when config disabled', () => {
      service = new NotificationService({ ...defaultConfig, enabled: false }, logger);
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when no dependencies set', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when enabled and dependencies set', () => {
      service.setDependencies({
        userService: mockUserService as never,
        twilioService: mockTwilioService as never,
      });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('notifyDownloadComplete', () => {
    beforeEach(() => {
      service.setDependencies({
        userService: mockUserService as never,
        twilioService: mockTwilioService as never,
      });
    });

    it('should return false when notifications disabled', async () => {
      service = new NotificationService({ ...defaultConfig, enabled: false }, logger);

      const result = await service.notifyDownloadComplete(createMockRequest());

      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      service.setDependencies({
        userService: mockUserService as never,
        twilioService: mockTwilioService as never,
      });
      mockUserService.getUser.mockReturnValue(undefined);

      const result = await service.notifyDownloadComplete(createMockRequest());

      expect(result).toBe(false);
    });

    it('should return false when user has notifications disabled', async () => {
      mockUserService.getUser.mockReturnValue(
        createMockUser({ notificationPreferences: { enabled: false } })
      );

      const result = await service.notifyDownloadComplete(createMockRequest());

      expect(result).toBe(false);
      expect(mockTwilioService.sendMessage).not.toHaveBeenCalled();
    });

    it('should send notification for movie', async () => {
      mockUserService.getUser.mockReturnValue(createMockUser());

      const request = createMockRequest({
        mediaType: 'movie',
        title: 'Inception',
        year: 2010,
      });

      const result = await service.notifyDownloadComplete(request);

      expect(result).toBe(true);
      expect(mockTwilioService.sendMessage).toHaveBeenCalledWith(
        '+1234567890',
        expect.stringContaining('Inception')
      );
    });

    it('should send notification for TV show', async () => {
      mockUserService.getUser.mockReturnValue(createMockUser());

      const request = createMockRequest({
        mediaType: 'tv_show',
        title: 'Breaking Bad',
        year: 2008,
      });

      const result = await service.notifyDownloadComplete(request);

      expect(result).toBe(true);
      expect(mockTwilioService.sendMessage).toHaveBeenCalled();
    });

    it('should handle missing year', async () => {
      mockUserService.getUser.mockReturnValue(createMockUser());

      const request = createMockRequest({
        title: 'Test Title',
        year: null,
      });

      const result = await service.notifyDownloadComplete(request);

      expect(result).toBe(true);
    });

    it('should return false for unsupported platforms', async () => {
      mockUserService.getUser.mockReturnValue(
        createMockUser({ identities: { telegram: '123456' } })
      );

      const request = createMockRequest({
        requestedBy: 'telegram:123456' as PlatformUserId,
      });

      const result = await service.notifyDownloadComplete(request);

      expect(result).toBe(false);
    });

    it('should handle twilio errors gracefully', async () => {
      mockUserService.getUser.mockReturnValue(createMockUser());
      mockTwilioService.sendMessage.mockRejectedValue(new Error('SMS failed'));

      const result = await service.notifyDownloadComplete(createMockRequest());

      expect(result).toBe(false);
    });
  });

  describe('verifyWebhookSecret', () => {
    it('should return true when no secret configured', () => {
      service = new NotificationService({ ...defaultConfig, webhookSecret: '' }, logger);

      expect(service.verifyWebhookSecret('any-value')).toBe(true);
    });

    it('should return true for matching secret', () => {
      expect(service.verifyWebhookSecret('test-secret')).toBe(true);
    });

    it('should return false for non-matching secret', () => {
      expect(service.verifyWebhookSecret('wrong-secret')).toBe(false);
    });
  });
});
