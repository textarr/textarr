import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';
import { loadConfig } from '../config/storage.js';
import { isPasswordHashSet } from './password.security.js';

// Routes that never require authentication
const PUBLIC_ROUTES = [
  '/api/auth/status',
  '/api/auth/csrf',
  '/api/auth/login',
  '/api/auth/setup',
  '/health',
  '/health/detailed',
  '/webhooks/sms',
  '/webhooks/sms/status',
  '/webhooks/sms/health',
];

// Routes allowed during initial setup (before admin account is created)
// This allows users to configure the app before creating credentials
const SETUP_PHASE_ROUTES = [
  '/api/config',
  '/api/users',
  '/api/quotas',
];

/**
 * Create middleware to protect dashboard API routes.
 * Allows public routes and static files, requires auth for /api/* routes.
 * During initial setup (no admin account), config routes are accessible.
 */
export function createDashboardAuthMiddleware(logger: Logger) {
  const log = logger.child({ middleware: 'dashboard-auth' });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? request.url; // Remove query string

    // Allow public routes
    if (PUBLIC_ROUTES.some((route) => path === route || path.startsWith(route + '/'))) {
      return;
    }

    // Allow static files (not /api/ routes)
    if (!path.startsWith('/api/')) {
      return;
    }

    // Check if admin is set up
    const config = loadConfig();
    const isSetup = isPasswordHashSet(config.admin?.passwordHash);

    // During initial setup phase, allow config/user routes without auth
    // This lets users configure the app before creating admin credentials
    if (!isSetup) {
      const isSetupPhaseRoute = SETUP_PHASE_ROUTES.some(
        (route) => path === route || path.startsWith(route + '/')
      );
      if (isSetupPhaseRoute) {
        log.debug({ path }, 'Allowing access during setup phase');
        return;
      }
      // Block other routes during setup
      log.debug({ path }, 'Access denied - setup required');
      return reply.status(401).send({ error: 'Setup required', code: 'SETUP_REQUIRED' });
    }

    // After setup, require authentication for all protected routes
    const isAuthenticated = request.session?.get('authenticated');

    if (!isAuthenticated) {
      log.debug({ path }, 'Access denied - not authenticated');
      return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
  };
}
