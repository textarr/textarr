import type { FastifyInstance } from 'fastify';
import type { ServiceContainer } from '../services/index.js';
import type { Logger } from '../utils/logger.js';
import { healthRoutes } from './health.route.js';
import { smsRoutes } from './sms.route.js';

/**
 * Register all application routes.
 * Routes check container.isInitialized before accessing services.
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  container: ServiceContainer,
  logger: Logger
) {
  // Health check routes
  await fastify.register(
    async (instance) => healthRoutes(instance, container),
    { prefix: '' }
  );

  // SMS webhook routes
  await fastify.register(
    async (instance) => smsRoutes(instance, container, logger),
    { prefix: '' }
  );
}
