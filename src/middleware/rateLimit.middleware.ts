import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
const rateLimitMap = new Map<string, RateLimitEntry>();

// Configuration
const RATE_LIMIT = 10; // Max requests per window
const WINDOW_MS = 60000; // 1 minute window

// Cleanup old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL_MS = 300000; // 5 minutes

let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process from exiting
  cleanupInterval.unref();
}

/**
 * Create middleware to rate limit requests by phone number
 * Prevents abuse and protects against cost attacks
 */
export function createRateLimitMiddleware(logger: Logger) {
  const log = logger.child({ middleware: 'rate-limit' });

  // Start cleanup on first use
  startCleanup();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { From?: string } | undefined;
    const from = body?.From;

    // If no phone number, let later middleware handle validation
    if (!from) {
      return;
    }

    const now = Date.now();
    const entry = rateLimitMap.get(from);

    // First request or window expired - reset counter
    if (!entry || now > entry.resetTime) {
      rateLimitMap.set(from, { count: 1, resetTime: now + WINDOW_MS });
      return;
    }

    // Check if rate limited
    if (entry.count >= RATE_LIMIT) {
      log.warn({ from, count: entry.count }, 'Rate limit exceeded');
      // Return empty 200 to avoid revealing information
      // (same pattern as unauthorized responses)
      return reply.status(200).send('');
    }

    // Increment counter
    entry.count++;
  };
}
