import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify, { type FastifyError } from 'fastify';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifySecureSession from '@fastify/secure-session';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCsrf from '@fastify/csrf-protection';
import type { Logger } from './utils/logger.js';
import type { ServiceContainer } from './services/index.js';
import { registerRoutes } from './routes/index.js';
import { configRoutes } from './routes/config.route.js';
import { authRoutes } from './routes/auth.route.js';
import { webhookRoutes } from './routes/webhook.route.js';
import { getOrGenerateSessionKey, createDashboardAuthMiddleware } from './security/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and configure Fastify server
 */
export async function createServer(container: ServiceContainer, logger: Logger) {
  const fastify = Fastify({
    logger: false,
    trustProxy: true,
  });

  // Security headers (CSP, X-Frame-Options, etc.)
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Required for inline styles
        imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for image loading
  });

  // Cookie support (required for sessions)
  await fastify.register(fastifyCookie);

  // Secure session with encrypted cookies
  await fastify.register(fastifySecureSession, {
    key: getOrGenerateSessionKey(),
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    },
  });

  // CSRF protection
  await fastify.register(fastifyCsrf, {
    sessionPlugin: '@fastify/secure-session',
    cookieOpts: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });

  // Global rate limiting
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // CORS for API access - restrict in production
  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow same-origin requests (no origin header)
      if (!origin) {
        return callback(null, true);
      }
      // In development, allow localhost
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      // In production, allow same origin
      return callback(null, true);
    },
    credentials: true, // Required for cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  // Parse form data (for Twilio webhooks)
  await fastify.register(formbody);

  // Serve static files (web UI)
  const publicPath = join(__dirname, '..', 'public');
  await fastify.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
  });

  // Dashboard authentication middleware (for /api/* routes)
  const dashboardAuth = createDashboardAuthMiddleware(logger);
  fastify.addHook('preHandler', dashboardAuth);

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api')) return; // Don't log static file requests
    logger.debug(
      {
        method: request.method,
        url: request.url,
        ip: request.ip,
      },
      'Incoming request'
    );
  });

  // Response logging
  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api')) return;
    logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'Request completed'
    );
  });

  // Error handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
        method: request.method,
        url: request.url,
      },
      'Request error'
    );

    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500 ? 'Internal Server Error' : error.message;

    return reply.status(statusCode).send({ error: message });
  });

  // Auth routes (login, logout, setup)
  await fastify.register(async (instance) => authRoutes(instance, logger), { prefix: '' });

  // Configuration routes (always available, pass container for hot-reload)
  await fastify.register(async (instance) => configRoutes(instance, container, logger), { prefix: '' });

  // Sonarr/Radarr webhook routes (no auth required - external services call these)
  await fastify.register(async (instance) => webhookRoutes(instance, container, logger), { prefix: '' });

  // App routes (always registered, routes check container.isInitialized)
  await registerRoutes(fastify, container, logger);

  // Fallback to index.html for SPA routing
  fastify.setNotFoundHandler(async (request, reply) => {
    // Don't serve web UI for API or webhook routes (registered routes still work)
    if (request.url.startsWith('/api') || request.url.startsWith('/webhooks') || request.url.startsWith('/health')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });

  return fastify;
}
