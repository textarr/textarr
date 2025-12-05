import { randomUUID } from 'crypto';
import type { Logger } from '../utils/logger.js';
import type { User, UserIdentities } from '../config/index.js';
import type { PlatformUserId } from '../messaging/types.js';
import { parsePlatformUserId } from '../messaging/types.js';
import { loadConfig, saveConfig } from '../config/storage.js';

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetDate: Date;
  message?: string;
}

/**
 * Configuration for quotas
 */
export interface QuotaConfig {
  enabled: boolean;
  period: 'daily' | 'weekly' | 'monthly';
  movieLimit: number;
  tvShowLimit: number;
  adminExempt: boolean;
}

/**
 * Service for managing users, authorization, and quotas
 */
export class UserService {
  private users: User[];
  private quotaConfig: QuotaConfig;
  private readonly logger: Logger;

  constructor(users: User[], quotaConfig: QuotaConfig, logger: Logger) {
    this.users = users;
    this.quotaConfig = quotaConfig;
    this.logger = logger.child({ service: 'user' });
  }

  /**
   * Check if a user is authorized by PlatformUserId
   */
  isAuthorized(userId: PlatformUserId): boolean {
    return this.getUser(userId) !== undefined;
  }

  /**
   * Get user by PlatformUserId
   */
  getUser(userId: PlatformUserId): User | undefined {
    const { platform, rawId } = parsePlatformUserId(userId);

    return this.users.find((u) => {
      switch (platform) {
        case 'sms':
          return u.identities.sms === rawId;
        case 'discord':
          return u.identities.discord === rawId;
        case 'slack':
          return u.identities.slack === rawId;
        case 'telegram':
          return u.identities.telegram === rawId;
        default:
          return false;
      }
    });
  }

  /**
   * Get user by user ID (UUID)
   */
  getUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return [...this.users];
  }

  /**
   * Get all admin users
   */
  getAdmins(): User[] {
    return this.users.filter((u) => u.isAdmin);
  }

  /**
   * Check if user is an admin by PlatformUserId
   */
  isAdmin(userId: PlatformUserId): boolean {
    const user = this.getUser(userId);
    return user?.isAdmin ?? false;
  }

  /**
   * Add a new user with platform identities
   */
  addUser(name: string, identities: UserIdentities, createdBy?: string): User {
    const now = new Date().toISOString();
    const newUser: User = {
      id: randomUUID(),
      name,
      isAdmin: false,
      createdAt: now,
      createdBy,
      identities,
      requestCount: {
        movies: 0,
        tvShows: 0,
        lastReset: now,
      },
      notificationPreferences: {
        enabled: true,
      },
    };

    this.users.push(newUser);
    this.persistUsers();
    this.logger.info({ name, identities, createdBy }, 'User added');
    return newUser;
  }

  /**
   * Link a platform identity to an existing user
   */
  linkIdentity(
    userId: PlatformUserId,
    platform: 'sms' | 'discord' | 'slack' | 'telegram',
    platformId: string
  ): boolean {
    const user = this.getUser(userId);
    if (!user) {
      return false;
    }

    user.identities[platform] = platformId;
    this.persistUsers();
    this.logger.info({ userId, platform, platformId }, 'Identity linked');
    return true;
  }

  /**
   * Unlink a platform identity from a user
   */
  unlinkIdentity(
    userId: PlatformUserId,
    platform: 'sms' | 'discord' | 'slack' | 'telegram'
  ): boolean {
    const user = this.getUser(userId);
    if (!user) {
      return false;
    }

    delete user.identities[platform];
    this.persistUsers();
    this.logger.info({ userId, platform }, 'Identity unlinked');
    return true;
  }

  /**
   * Remove a user by user ID
   */
  removeUser(userId: string): boolean {
    const index = this.users.findIndex((u) => u.id === userId);
    if (index === -1) {
      return false;
    }

    this.users.splice(index, 1);
    this.persistUsers();
    this.logger.info({ userId }, 'User removed');
    return true;
  }

  /**
   * Update user's name by user ID
   */
  updateUserName(userId: string, name: string): boolean {
    const user = this.getUserById(userId);
    if (!user) {
      return false;
    }

    user.name = name;
    this.persistUsers();
    return true;
  }

  /**
   * Promote user to admin by user ID
   */
  promoteToAdmin(userId: string): boolean {
    const user = this.getUserById(userId);
    if (!user) {
      return false;
    }

    user.isAdmin = true;
    this.persistUsers();
    this.logger.info({ userId }, 'User promoted to admin');
    return true;
  }

  /**
   * Demote user from admin by user ID
   */
  demoteFromAdmin(userId: string): boolean {
    const user = this.getUserById(userId);
    if (!user) {
      return false;
    }

    user.isAdmin = false;
    this.persistUsers();
    this.logger.info({ userId }, 'User demoted from admin');
    return true;
  }

  /**
   * Check if user can make a request (quota check) by PlatformUserId
   */
  checkQuota(userId: PlatformUserId, mediaType: 'movie' | 'tv_show'): QuotaCheckResult {
    if (!this.quotaConfig.enabled) {
      return { allowed: true, current: 0, limit: 0, resetDate: new Date() };
    }

    const user = this.getUser(userId);
    if (!user) {
      return { allowed: false, current: 0, limit: 0, resetDate: new Date(), message: 'User not found' };
    }

    // Admins bypass quota if configured
    if (user.isAdmin && this.quotaConfig.adminExempt) {
      return { allowed: true, current: 0, limit: 0, resetDate: new Date() };
    }

    // Check if reset is needed
    this.maybeResetQuota(user);

    const limit = mediaType === 'movie' ? this.quotaConfig.movieLimit : this.quotaConfig.tvShowLimit;
    const current = mediaType === 'movie' ? user.requestCount.movies : user.requestCount.tvShows;
    const resetDate = this.getNextResetDate(new Date(user.requestCount.lastReset));

    // 0 limit means unlimited
    if (limit === 0) {
      return { allowed: true, current, limit, resetDate };
    }

    const allowed = current < limit;
    const message = allowed
      ? undefined
      : `You've used ${current}/${limit} ${mediaType === 'movie' ? 'movie' : 'TV show'} requests this ${this.quotaConfig.period}. Resets ${this.formatResetDate(resetDate)}.`;

    return { allowed, current, limit, resetDate, message };
  }

  /**
   * Increment user's request count by PlatformUserId
   */
  incrementRequestCount(userId: PlatformUserId, mediaType: 'movie' | 'tv_show'): void {
    const user = this.getUser(userId);
    if (!user) {
      return;
    }

    // Check if reset is needed before incrementing
    this.maybeResetQuota(user);

    if (mediaType === 'movie') {
      user.requestCount.movies++;
    } else {
      user.requestCount.tvShows++;
    }

    this.persistUsers();
    this.logger.debug({ userId, mediaType, count: user.requestCount }, 'Request count incremented');
  }

  /**
   * Add quota to user by user ID (admin override)
   */
  addQuota(userId: string, mediaType: 'movie' | 'tv_show', amount: number): boolean {
    const user = this.getUserById(userId);
    if (!user) {
      return false;
    }

    // Negative amount reduces the count (gives more quota)
    if (mediaType === 'movie') {
      user.requestCount.movies = Math.max(0, user.requestCount.movies - amount);
    } else {
      user.requestCount.tvShows = Math.max(0, user.requestCount.tvShows - amount);
    }

    this.persistUsers();
    this.logger.info({ userId, mediaType, amount }, 'Quota adjusted');
    return true;
  }

  /**
   * Update quota configuration
   */
  updateQuotaConfig(config: Partial<QuotaConfig>): void {
    this.quotaConfig = { ...this.quotaConfig, ...config };
    // Persist quota config changes
    const appConfig = loadConfig();
    appConfig.quotas = this.quotaConfig;
    saveConfig(appConfig);
  }

  /**
   * Reset quota for a specific user if period has elapsed
   */
  private maybeResetQuota(user: User): void {
    const lastReset = new Date(user.requestCount.lastReset);
    const now = new Date();

    if (this.shouldResetQuota(lastReset, now)) {
      user.requestCount.movies = 0;
      user.requestCount.tvShows = 0;
      user.requestCount.lastReset = now.toISOString();
      this.persistUsers();
      this.logger.debug({ userId: user.id }, 'Quota reset');
    }
  }

  /**
   * Check if quota should be reset based on period
   */
  private shouldResetQuota(lastReset: Date, now: Date): boolean {
    switch (this.quotaConfig.period) {
      case 'daily':
        return lastReset.toDateString() !== now.toDateString();
      case 'weekly': {
        const lastResetWeek = this.getWeekNumber(lastReset);
        const nowWeek = this.getWeekNumber(now);
        return lastResetWeek !== nowWeek || lastReset.getFullYear() !== now.getFullYear();
      }
      case 'monthly':
        return (
          lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()
        );
      default:
        return false;
    }
  }

  /**
   * Get week number of year
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get next reset date
   */
  private getNextResetDate(lastReset: Date): Date {
    const next = new Date(lastReset);
    switch (this.quotaConfig.period) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        break;
      case 'weekly': {
        // Next Monday
        const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
        next.setDate(next.getDate() + daysUntilMonday);
        next.setHours(0, 0, 0, 0);
        break;
      }
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        next.setHours(0, 0, 0, 0);
        break;
    }
    return next;
  }

  /**
   * Format reset date for display
   */
  private formatResetDate(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'today';
    } else if (days === 1) {
      return 'tomorrow';
    } else if (days < 7) {
      return `on ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
    } else {
      return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
  }

  /**
   * Persist users to storage
   */
  private persistUsers(): void {
    const config = loadConfig();
    config.users = this.users;
    saveConfig(config);
  }
}
