import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';
import type { TwilioWebhookPayload } from '../schemas/index.js';
import type { ServiceContainer } from '../services/index.js';
import { createPlatformUserId } from '../messaging/types.js';

/**
 * Create middleware to check if SMS user is authorized.
 * Uses container to get the current user service (supports hot-reload).
 */
export function createAuthMiddleware(container: ServiceContainer, logger: Logger) {
  const log = logger.child({ middleware: 'auth' });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if services are initialized
    if (!container.isInitialized) {
      log.warn('Services not initialized - cannot authorize');
      return reply.status(503).send('Service unavailable');
    }

    const body = request.body as TwilioWebhookPayload;
    const from = body?.From;

    if (!from) {
      log.warn('Request missing From field');
      // Return empty response - don't reveal the bot exists
      return reply.status(200).send('');
    }

    const userService = container.user;
    const userId = createPlatformUserId('sms', from);

    if (!userService.isAuthorized(userId)) {
      log.warn({ from }, 'Unauthorized phone number');
      // Return empty response - don't reveal the bot exists
      return reply.status(200).send('');
    }

    const user = userService.getUser(userId);
    log.debug({ from, userName: user?.name }, 'Phone number authorized');
  };
}
