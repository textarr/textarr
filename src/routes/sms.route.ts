import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ServiceContainer } from '../services/index.js';
import type { Logger } from '../utils/logger.js';
import { MessageHandler } from '../handlers/message.handler.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { createTwilioValidationMiddleware } from '../middleware/twilio.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.middleware.js';
import { TwilioWebhookPayloadSchema, type TwilioWebhookPayload } from '../schemas/index.js';
import { createPlatformUserId } from '../messaging/types.js';

/**
 * Register SMS webhook routes
 */
export async function smsRoutes(
  fastify: FastifyInstance,
  container: ServiceContainer,
  logger: Logger
) {
  // Middleware for rate limiting (prevents abuse)
  const rateLimitMiddleware = createRateLimitMiddleware(logger);

  // Middleware for Twilio validation (created per-request to get current auth token)
  const twilioValidation = createTwilioValidationMiddleware(container, logger);

  // Middleware for phone number authorization (uses container)
  const authMiddleware = createAuthMiddleware(container, logger);

  // SMS webhook endpoint
  fastify.post<{ Body: TwilioWebhookPayload }>(
    '/webhooks/sms',
    {
      preHandler: [rateLimitMiddleware, twilioValidation, authMiddleware],
    },
    async (request: FastifyRequest<{ Body: TwilioWebhookPayload }>, reply: FastifyReply) => {
      const log = logger.child({ route: 'sms-webhook' });

      // Check if services are initialized
      if (!container.isInitialized) {
        log.warn('Services not initialized - SMS webhook unavailable');
        const notConfiguredMsg = container.currentConfig?.messages?.notConfigured || 'Service not configured. Please complete setup.';
        return reply
          .header('Content-Type', 'text/xml')
          .send(`<Response><Message>${notConfiguredMsg}</Message></Response>`);
      }

      // Validate the payload
      const parseResult = TwilioWebhookPayloadSchema.safeParse(request.body);

      if (!parseResult.success) {
        log.warn({ errors: parseResult.error.flatten() }, 'Invalid webhook payload');
        return reply.status(400).send('Bad Request');
      }

      const { From: from, Body: body } = parseResult.data;

      log.info({ from, body }, 'Received SMS');

      // Send immediate acknowledgment and process in background
      const config = container.currentConfig!;
      const ackEnabled = config.messages.acknowledgmentEnabled;
      const ackMessage = config.messages.acknowledgment;
      const ackTwiml = ackEnabled
        ? container.twilio.generateTwiML(ackMessage)
        : '<Response></Response>';

      // Process the message in the background
      setImmediate(async () => {
        const startTime = Date.now();
        log.info({ from }, 'Starting background message processing');

        try {
          // Create MessageHandler with current services and config
          const config = container.currentConfig!;
          const messageHandler = new MessageHandler(container.all, config, logger);

          // Convert phone number to PlatformUserId
          const userId = createPlatformUserId('sms', from);

          // Process the message
          const response = await messageHandler.handleMessage(userId, body);
          const processingTime = Date.now() - startTime;

          log.info({
            from,
            processingTimeMs: processingTime,
            responseLength: response.text.length,
            hasMedia: !!response.mediaUrls?.length,
          }, 'Message processing complete');

          // Send the actual response via Twilio API
          await container.twilio.sendMessage(from, {
            body: response.text,
            mediaUrls: response.mediaUrls,
          });

          log.info({ from, processingTimeMs: processingTime }, 'Response sent successfully');

        } catch (error) {
          const processingTime = Date.now() - startTime;
          log.error({ error, from, processingTimeMs: processingTime }, 'Error processing SMS in background');

          // Send error message via API
          try {
            const errorMsg = container.currentConfig?.messages?.genericError || 'Something went wrong. Please try again.';
            await container.twilio.sendMessage(from, errorMsg);
            log.info({ from }, 'Error message sent to user');
          } catch (sendError) {
            log.error({ sendError, from }, 'Failed to send error message');
          }
        }
      });

      // Return immediate acknowledgment
      return reply
        .header('Content-Type', 'text/xml')
        .send(ackTwiml);
    }
  );

  // Status callback endpoint (optional - for tracking delivery)
  fastify.post('/webhooks/sms/status', async (request, reply) => {
    const log = logger.child({ route: 'sms-status' });
    log.debug({ body: request.body }, 'Received status callback');

    // Just acknowledge - we don't need to process status updates
    return reply.status(200).send('');
  });

  // Health check endpoint for webhook (GET allowed for testing connectivity)
  fastify.get('/webhooks/sms/health', async (request, reply) => {
    const isInitialized = container.isInitialized;
    const config = container.currentConfig;

    return reply.send({
      status: isInitialized ? 'ready' : 'not_configured',
      webhook: '/webhooks/sms',
      method: 'POST',
      services: {
        twilio: !!config?.twilio?.accountSid,
        ai: !!config?.ai?.openaiApiKey || !!config?.ai?.anthropicApiKey || !!config?.ai?.googleApiKey,
        sonarr: !!config?.sonarr?.apiKey,
        radarr: !!config?.radarr?.apiKey,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
