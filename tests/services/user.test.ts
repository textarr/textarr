import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/services/user.service.js';
import type { User } from '../../src/config/index.js';
import type { PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// Mock the config storage module
vi.mock('../../src/config/storage.js', () => ({
  loadConfig: vi.fn(() => ({ users: [] })),
  saveConfig: vi.fn(),
}));

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-uuid-123',
  name: 'Test User',
  isAdmin: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  identities: { sms: '+1234567890' },
  requestCount: {
    movies: 0,
    tvShows: 0,
    lastReset: '2024-01-01T00:00:00.000Z',
  },
  notificationPreferences: { enabled: true },
  ...overrides,
});

const defaultQuotaConfig = {
  enabled: true,
  period: 'monthly' as const,
  movieLimit: 10,
  tvShowLimit: 10,
  adminExempt: true,
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('should return true for authorized users', () => {
      const users = [createMockUser()];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAuthorized(userId)).toBe(true);
    });

    it('should return false for unauthorized users', () => {
      const users = [createMockUser()];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+9999999999';
      expect(service.isAuthorized(userId)).toBe(false);
    });
  });

  describe('getUser', () => {
    it('should return user by platform user id', () => {
      const users = [createMockUser()];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const user = service.getUser(userId);

      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    it('should return undefined for non-existent user', () => {
      service = new UserService([], defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+9999999999';
      expect(service.getUser(userId)).toBeUndefined();
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', () => {
      const users = [
        createMockUser({ id: 'uuid-1', identities: { sms: '+1111111111' }, name: 'User 1' }),
        createMockUser({ id: 'uuid-2', identities: { sms: '+2222222222' }, name: 'User 2' }),
      ];
      service = new UserService(users, defaultQuotaConfig, logger);

      const allUsers = service.getAllUsers();

      expect(allUsers).toHaveLength(2);
    });

    it('should return a copy of users array', () => {
      const users = [createMockUser()];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.getAllUsers();
      result.push(createMockUser({ id: 'uuid-new', identities: { sms: '+9999999999' } }));

      expect(service.getAllUsers()).toHaveLength(1);
    });
  });

  describe('admin management', () => {
    it('should identify admin users', () => {
      const users = [createMockUser({ isAdmin: true })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAdmin(userId)).toBe(true);
    });

    it('should return false for non-admin users', () => {
      const users = [createMockUser({ isAdmin: false })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAdmin(userId)).toBe(false);
    });

    it('should return false for non-existent users', () => {
      service = new UserService([], defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+9999999999';
      expect(service.isAdmin(userId)).toBe(false);
    });

    it('should get all admin users', () => {
      const users = [
        createMockUser({ id: 'uuid-1', identities: { sms: '+1111111111' }, isAdmin: true }),
        createMockUser({ id: 'uuid-2', identities: { sms: '+2222222222' }, isAdmin: false }),
        createMockUser({ id: 'uuid-3', identities: { sms: '+3333333333' }, isAdmin: true }),
      ];
      service = new UserService(users, defaultQuotaConfig, logger);

      const admins = service.getAdmins();

      expect(admins).toHaveLength(2);
      expect(admins.every((u) => u.isAdmin)).toBe(true);
    });

    it('should promote user to admin', () => {
      const mockUser = createMockUser({ isAdmin: false });
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.promoteToAdmin(mockUser.id);

      expect(result).toBe(true);
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAdmin(userId)).toBe(true);
    });

    it('should demote user from admin', () => {
      const mockUser = createMockUser({ isAdmin: true });
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.demoteFromAdmin(mockUser.id);

      expect(result).toBe(true);
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAdmin(userId)).toBe(false);
    });
  });

  describe('user management', () => {
    it('should add a new user', () => {
      service = new UserService([], defaultQuotaConfig, logger);

      const newUser = service.addUser('New User', { sms: '+1234567890' }, 'sms:+0000000000');

      expect(newUser.identities.sms).toBe('+1234567890');
      expect(newUser.name).toBe('New User');
      expect(newUser.createdBy).toBe('sms:+0000000000');
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAuthorized(userId)).toBe(true);
    });

    it('should remove a user', () => {
      const mockUser = createMockUser();
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.removeUser(mockUser.id);

      expect(result).toBe(true);
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.isAuthorized(userId)).toBe(false);
    });

    it('should return false when removing non-existent user', () => {
      service = new UserService([], defaultQuotaConfig, logger);

      expect(service.removeUser('non-existent-uuid')).toBe(false);
    });

    it('should update user name', () => {
      const mockUser = createMockUser();
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.updateUserName(mockUser.id, 'Updated Name');

      expect(result).toBe(true);
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.getUser(userId)?.name).toBe('Updated Name');
    });

    it('should return false when updating non-existent user', () => {
      service = new UserService([], defaultQuotaConfig, logger);

      expect(service.updateUserName('non-existent-uuid', 'Name')).toBe(false);
    });
  });

  describe('quota management', () => {
    it('should allow request when quota is disabled', () => {
      const users = [createMockUser()];
      service = new UserService(users, { ...defaultQuotaConfig, enabled: false }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
    });

    it('should allow request when under limit', () => {
      const users = [createMockUser({ requestCount: { movies: 5, tvShows: 0, lastReset: new Date().toISOString() } })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(10);
    });

    it('should deny request when at limit', () => {
      const users = [createMockUser({ requestCount: { movies: 10, tvShows: 0, lastReset: new Date().toISOString() } })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("You've used 10/10");
    });

    it('should exempt admins when configured', () => {
      const users = [createMockUser({ isAdmin: true, requestCount: { movies: 100, tvShows: 0, lastReset: new Date().toISOString() } })];
      service = new UserService(users, { ...defaultQuotaConfig, adminExempt: true }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
    });

    it('should not exempt admins when not configured', () => {
      const users = [createMockUser({ isAdmin: true, requestCount: { movies: 10, tvShows: 0, lastReset: new Date().toISOString() } })];
      service = new UserService(users, { ...defaultQuotaConfig, adminExempt: false }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(false);
    });

    it('should allow unlimited when limit is 0', () => {
      const users = [createMockUser({ requestCount: { movies: 100, tvShows: 0, lastReset: new Date().toISOString() } })];
      service = new UserService(users, { ...defaultQuotaConfig, movieLimit: 0 }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
    });

    it('should increment request count', () => {
      const users = [createMockUser({ requestCount: { movies: 5, tvShows: 3, lastReset: new Date().toISOString() } })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      service.incrementRequestCount(userId, 'movie');
      service.incrementRequestCount(userId, 'tv_show');

      const user = service.getUser(userId);
      expect(user?.requestCount.movies).toBe(6);
      expect(user?.requestCount.tvShows).toBe(4);
    });

    it('should add quota to user', () => {
      const mockUser = createMockUser({ requestCount: { movies: 8, tvShows: 5, lastReset: new Date().toISOString() } });
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      const result = service.addQuota(mockUser.id, 'movie', 3);

      expect(result).toBe(true);
      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.getUser(userId)?.requestCount.movies).toBe(5);
    });

    it('should not allow negative quota', () => {
      const mockUser = createMockUser({ requestCount: { movies: 2, tvShows: 0, lastReset: new Date().toISOString() } });
      const users = [mockUser];
      service = new UserService(users, defaultQuotaConfig, logger);

      service.addQuota(mockUser.id, 'movie', 10);

      const userId: PlatformUserId = 'sms:+1234567890';
      expect(service.getUser(userId)?.requestCount.movies).toBe(0);
    });

    it('should check TV show quota separately', () => {
      const users = [createMockUser({ requestCount: { movies: 0, tvShows: 10, lastReset: new Date().toISOString() } })];
      service = new UserService(users, defaultQuotaConfig, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const movieResult = service.checkQuota(userId, 'movie');
      const tvResult = service.checkQuota(userId, 'tv_show');

      expect(movieResult.allowed).toBe(true);
      expect(tvResult.allowed).toBe(false);
    });
  });

  describe('quota reset', () => {
    it('should reset quota for daily period', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const users = [createMockUser({
        requestCount: {
          movies: 10,
          tvShows: 10,
          lastReset: yesterday.toISOString()
        }
      })];
      service = new UserService(users, { ...defaultQuotaConfig, period: 'daily' }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
    });

    it('should reset quota for weekly period', () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 8);

      const users = [createMockUser({
        requestCount: {
          movies: 10,
          tvShows: 10,
          lastReset: lastWeek.toISOString()
        }
      })];
      service = new UserService(users, { ...defaultQuotaConfig, period: 'weekly' }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
    });

    it('should reset quota for monthly period', () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const users = [createMockUser({
        requestCount: {
          movies: 10,
          tvShows: 10,
          lastReset: lastMonth.toISOString()
        }
      })];
      service = new UserService(users, { ...defaultQuotaConfig, period: 'monthly' }, logger);

      const userId: PlatformUserId = 'sms:+1234567890';
      const result = service.checkQuota(userId, 'movie');

      expect(result.allowed).toBe(true);
    });
  });
});
