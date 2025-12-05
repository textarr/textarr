import type { Logger } from '../utils/logger.js';
import type { UserService } from './user.service.js';
import type { TwilioService } from './twilio.service.js';
import type { MediaRequest } from '../config/index.js';
import type { Platform, PlatformUserId } from '../messaging/types.js';
import { parsePlatformUserId } from '../messaging/types.js';

/**
 * Configuration for download notifications
 */
export interface DownloadNotificationConfig {
  enabled: boolean;
  webhookSecret: string;
  messageTemplate: string;
}

/**
 * Dependencies for the notification service
 */
export interface NotificationDependencies {
  userService: UserService;
  twilioService: TwilioService;
}

/**
 * Service for sending download notifications to users
 */
export class NotificationService {
  private readonly logger: Logger;
  private readonly config: DownloadNotificationConfig;
  private deps?: NotificationDependencies;

  constructor(config: DownloadNotificationConfig, logger: Logger) {
    this.logger = logger.child({ service: 'notification' });
    this.config = config;
  }

  /**
   * Set dependencies after construction (to avoid circular deps)
   */
  setDependencies(deps: NotificationDependencies): void {
    this.deps = deps;
    this.logger.debug('Notification service dependencies set');
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.deps;
  }

  /**
   * Send download completion notification to the requesting user
   */
  async notifyDownloadComplete(request: MediaRequest): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.debug('Notifications disabled, skipping');
      return false;
    }

    const user = this.deps!.userService.getUser(request.requestedBy as PlatformUserId);

    if (!user) {
      this.logger.warn({ requestedBy: request.requestedBy }, 'User not found for notification');
      return false;
    }

    // Check user's notification preferences
    if (!user.notificationPreferences?.enabled) {
      this.logger.debug({ userId: user.id }, 'User has notifications disabled');
      return false;
    }

    // Format notification message
    const message = this.formatMessage(request);

    // Send notification via the same platform the user made the request from
    const { platform, rawId } = parsePlatformUserId(request.requestedBy as PlatformUserId);
    const success = await this.sendNotification(platform, rawId, message);

    if (success) {
      this.logger.info(
        { userId: user.id, title: request.title, platform },
        'Download notification sent'
      );
    }

    return success;
  }

  /**
   * Format the notification message using the template
   */
  private formatMessage(request: MediaRequest): string {
    const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
    const year = request.year ? ` (${request.year})` : '';

    return this.config.messageTemplate
      .replace('{emoji}', emoji)
      .replace('{title}', request.title)
      .replace('{year}', year)
      .replace('{mediaType}', request.mediaType === 'movie' ? 'Movie' : 'TV Show');
  }

  /**
   * Send notification to a specific platform user
   */
  private async sendNotification(platform: Platform, rawId: string, message: string): Promise<boolean> {
    if (!this.deps) {
      return false;
    }

    try {
      // Currently only SMS is supported for notifications
      // TODO: Add support for Discord, Slack, Telegram
      if (platform === 'sms') {
        await this.deps.twilioService.sendMessage(rawId, message);
        return true;
      }

      this.logger.warn({ platform }, 'Notification platform not yet supported');
      return false;
    } catch (error) {
      this.logger.error({ error, platform, rawId }, 'Failed to send notification');
      return false;
    }
  }

  /**
   * Verify webhook secret
   */
  verifyWebhookSecret(providedSecret: string): boolean {
    if (!this.config.webhookSecret) {
      return true; // No secret configured, allow all
    }
    return providedSecret === this.config.webhookSecret;
  }
}
