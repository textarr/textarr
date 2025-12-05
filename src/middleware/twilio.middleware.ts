import type { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import type { Logger } from '../utils/logger.js';
import type { ServiceContainer } from '../services/index.js';

/**
 * Create middleware to validate Twilio webhook signatures.
 * Uses container to get the current auth token (supports hot-reload).
 */
export function createTwilioValidationMiddleware(container: ServiceContainer, logger: Logger) {
  const log = logger.child({ middleware: 'twilio-validation' });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip validation in development if configured
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_TWILIO_VALIDATION === 'true') {
      log.debug('Skipping Twilio validation in development');
      return;
    }

    // Check if services are initialized
    if (!container.isInitialized || !container.currentConfig) {
      log.warn('Services not initialized - cannot validate Twilio signature');
      return reply.status(503).send('Service unavailable');
    }

    const authToken = container.currentConfig.twilio.authToken;
    const signature = request.headers['x-twilio-signature'] as string;

    if (!signature) {
      log.warn('Missing Twilio signature header');
      return reply.status(403).send('Forbidden');
    }

    // Build the full URL that Twilio used to sign the request
    const protocol = String(request.headers['x-forwarded-proto'] || request.protocol);
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || 'localhost');
    const url = `${protocol}://${host}${request.url}`;

    const isValid = twilio.validateRequest(
      authToken,
      signature,
      url,
      request.body as Record<string, string>
    );

    if (!isValid) {
      log.warn({ url }, 'Invalid Twilio signature');
      return reply.status(403).send('Forbidden');
    }

    log.debug('Twilio signature validated');
  };
}
