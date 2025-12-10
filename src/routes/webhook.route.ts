import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';
import type { ServiceContainer } from '../services/container.js';

/**
 * Sonarr webhook event types
 */
interface SonarrWebhookBody {
  eventType: 'Grab' | 'Download' | 'Rename' | 'SeriesDelete' | 'EpisodeFileDelete' | 'Test' | 'HealthIssue';
  series?: {
    id: number;
    title: string;
    tvdbId: number;
    imdbId?: string;
    type?: string;
  };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title: string;
  }>;
  release?: {
    quality: string;
    releaseTitle: string;
  };
}

/**
 * Radarr webhook event types
 */
interface RadarrWebhookBody {
  eventType: 'Grab' | 'Download' | 'Rename' | 'MovieDelete' | 'MovieFileDelete' | 'Test' | 'HealthIssue';
  movie?: {
    id: number;
    title: string;
    year: number;
    tmdbId: number;
    imdbId?: string;
  };
  release?: {
    quality: string;
    releaseTitle: string;
  };
}

/**
 * Register Sonarr/Radarr webhook routes
 */
export async function webhookRoutes(
  fastify: FastifyInstance,
  container: ServiceContainer,
  logger: Logger
): Promise<void> {
  const log = logger.child({ route: 'webhook' });

  /**
   * Verify webhook secret from request headers
   */
  const verifySecret = (request: FastifyRequest): boolean => {
    const services = container.getServices();
    if (!services?.notification) {
      return true; // No notification service, allow all
    }

    const secretHeader = request.headers['x-webhook-secret'];
    const authHeader = request.headers['authorization'];
    const secret =
      (Array.isArray(secretHeader) ? secretHeader[0] : secretHeader) ||
      (typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : '');

    return services.notification.verifyWebhookSecret(secret || '');
  };

  /**
   * POST /webhooks/sonarr - Handle Sonarr webhook events
   */
  fastify.post<{ Body: SonarrWebhookBody }>(
    '/webhooks/sonarr',
    async (request: FastifyRequest<{ Body: SonarrWebhookBody }>, reply: FastifyReply) => {
      log.info({ eventType: request.body.eventType }, 'Sonarr webhook received');

      // Verify secret
      if (!verifySecret(request)) {
        log.warn('Invalid webhook secret');
        return reply.status(401).send({ error: 'Invalid webhook secret' });
      }

      const { eventType, series } = request.body;

      // Handle test webhook
      if (eventType === 'Test') {
        log.info('Sonarr webhook test successful');
        return { status: 'ok', message: 'Webhook test successful' };
      }

      // Handle download complete
      if (eventType === 'Download' && series) {
        log.info({ seriesId: series.id, title: series.title }, 'Sonarr download complete');

        const services = container.getServices();
        if (services?.mediaRequest && services?.notification) {
          // Find the request by Sonarr ID
          const mediaRequest = services.mediaRequest.findByArrId('sonarr', series.id);

          if (mediaRequest) {
            // Update status and send notification
            services.mediaRequest.updateStatus(mediaRequest.id, 'completed');
            await services.notification.notifyDownloadComplete(mediaRequest);
            log.info({ requestId: mediaRequest.id }, 'Download notification sent for TV show');
          } else {
            log.debug({ seriesId: series.id }, 'No pending request found for series');
          }
        }
      }

      return { status: 'ok' };
    }
  );

  /**
   * POST /webhooks/radarr - Handle Radarr webhook events
   */
  fastify.post<{ Body: RadarrWebhookBody }>(
    '/webhooks/radarr',
    async (request: FastifyRequest<{ Body: RadarrWebhookBody }>, reply: FastifyReply) => {
      log.info({ eventType: request.body.eventType }, 'Radarr webhook received');

      // Verify secret
      if (!verifySecret(request)) {
        log.warn('Invalid webhook secret');
        return reply.status(401).send({ error: 'Invalid webhook secret' });
      }

      const { eventType, movie } = request.body;

      // Handle test webhook
      if (eventType === 'Test') {
        log.info('Radarr webhook test successful');
        return { status: 'ok', message: 'Webhook test successful' };
      }

      // Handle download complete
      if (eventType === 'Download' && movie) {
        log.info({ movieId: movie.id, title: movie.title }, 'Radarr download complete');

        const services = container.getServices();
        if (services?.mediaRequest && services?.notification) {
          // Find the request by Radarr ID or TMDB ID
          let mediaRequest = services.mediaRequest.findByArrId('radarr', movie.id);

          if (!mediaRequest && movie.tmdbId) {
            mediaRequest = services.mediaRequest.findByTmdbId(movie.tmdbId, 'movie');
          }

          if (mediaRequest) {
            // Update status and send notification
            services.mediaRequest.updateStatus(mediaRequest.id, 'completed');
            await services.notification.notifyDownloadComplete(mediaRequest);
            log.info({ requestId: mediaRequest.id }, 'Download notification sent for movie');
          } else {
            log.debug({ movieId: movie.id, tmdbId: movie.tmdbId }, 'No pending request found for movie');
          }
        }
      }

      return { status: 'ok' };
    }
  );

  log.info('Webhook routes registered');
}
