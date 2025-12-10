import { randomUUID } from 'crypto';
import type { Logger } from '../utils/logger.js';
import type { MediaRequest } from '../config/index.js';
import type { PlatformUserId } from '../messaging/types.js';
import { loadConfig, saveConfig } from '../config/storage.js';

/**
 * Service for tracking media requests for download notifications
 */
export class MediaRequestService {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'media-request' });
  }

  /**
   * Record a new media request
   */
  recordRequest(
    mediaType: 'movie' | 'tv_show',
    title: string,
    year: number | null,
    tmdbId: number,
    requestedBy: PlatformUserId,
    options?: { tvdbId?: number; radarrId?: number; sonarrId?: number }
  ): MediaRequest {
    const config = loadConfig();

    const request: MediaRequest = {
      id: randomUUID(),
      mediaType,
      title,
      year,
      tmdbId,
      tvdbId: options?.tvdbId,
      radarrId: options?.radarrId,
      sonarrId: options?.sonarrId,
      requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    config.mediaRequests.push(request);
    saveConfig(config);

    this.logger.info({ requestId: request.id, title, tmdbId, requestedBy }, 'Media request recorded');
    return request;
  }

  /**
   * Find request by Sonarr or Radarr ID
   * Only returns pending/downloading requests to avoid duplicate notifications
   */
  findByArrId(type: 'sonarr' | 'radarr', arrId: number): MediaRequest | undefined {
    const config = loadConfig();
    return config.mediaRequests.find(
      (r) =>
        (type === 'sonarr' ? r.sonarrId : r.radarrId) === arrId &&
        (r.status === 'pending' || r.status === 'downloading')
    );
  }

  /**
   * Find request by TMDB ID
   * Only returns pending/downloading requests to avoid duplicate notifications
   */
  findByTmdbId(tmdbId: number, mediaType?: 'movie' | 'tv_show'): MediaRequest | undefined {
    const config = loadConfig();
    return config.mediaRequests.find(
      (r) =>
        r.tmdbId === tmdbId &&
        (!mediaType || r.mediaType === mediaType) &&
        (r.status === 'pending' || r.status === 'downloading')
    );
  }

  /**
   * Find all pending requests
   */
  findPendingRequests(): MediaRequest[] {
    const config = loadConfig();
    return config.mediaRequests.filter((r) => r.status === 'pending' || r.status === 'downloading');
  }

  /**
   * Update request status
   */
  updateStatus(requestId: string, status: MediaRequest['status']): boolean {
    const config = loadConfig();
    const request = config.mediaRequests.find((r) => r.id === requestId);

    if (!request) {
      return false;
    }

    request.status = status;
    saveConfig(config);
    this.logger.info({ requestId, status }, 'Request status updated');
    return true;
  }

  /**
   * Update request with Sonarr/Radarr ID after adding to library
   */
  updateArrId(requestId: string, type: 'sonarr' | 'radarr', arrId: number): boolean {
    const config = loadConfig();
    const request = config.mediaRequests.find((r) => r.id === requestId);

    if (!request) {
      return false;
    }

    if (type === 'sonarr') {
      request.sonarrId = arrId;
    } else {
      request.radarrId = arrId;
    }

    saveConfig(config);
    this.logger.debug({ requestId, type, arrId }, 'Request arr ID updated');
    return true;
  }

  /**
   * Get request by ID
   */
  getRequest(requestId: string): MediaRequest | undefined {
    const config = loadConfig();
    return config.mediaRequests.find((r) => r.id === requestId);
  }

  /**
   * Get all requests for a user
   */
  getRequestsByUser(userId: PlatformUserId): MediaRequest[] {
    const config = loadConfig();
    return config.mediaRequests.filter((r) => r.requestedBy === userId);
  }

  /**
   * Remove completed/old requests (cleanup)
   */
  cleanup(olderThanDays: number = 30): number {
    const config = loadConfig();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const initialCount = config.mediaRequests.length;

    config.mediaRequests = config.mediaRequests.filter(
      (r) => r.status !== 'completed' || new Date(r.requestedAt).getTime() > cutoff
    );

    const removedCount = initialCount - config.mediaRequests.length;
    if (removedCount > 0) {
      saveConfig(config);
      this.logger.info({ removedCount, olderThanDays }, 'Old requests cleaned up');
    }

    return removedCount;
  }
}
