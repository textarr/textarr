import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';
import { loadConfig, saveConfig } from '../config/storage.js';
import { hashPassword, verifyPassword, isPasswordHashSet } from '../security/password.security.js';

interface LoginBody {
  username: string;
  password: string;
}

interface SetupBody {
  username: string;
  password: string;
  confirmPassword: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

// Extend session data type
declare module '@fastify/secure-session' {
  interface SessionData {
    authenticated: boolean;
    username: string;
  }
}

/**
 * Register authentication routes
 */
export async function authRoutes(fastify: FastifyInstance, logger: Logger) {
  const log = logger.child({ route: 'auth' });

  // Check authentication status
  fastify.get('/api/auth/status', async (request: FastifyRequest) => {
    const config = loadConfig();
    const isSetup = isPasswordHashSet(config.admin?.passwordHash);
    const isAuthenticated = !!request.session?.get('authenticated');

    return {
      isSetup,
      isAuthenticated,
      username: isAuthenticated ? request.session.get('username') : null,
    };
  });

  // Get CSRF token
  fastify.get('/api/auth/csrf', async (_request: FastifyRequest, reply: FastifyReply) => {
    const token = reply.generateCsrf();
    return { csrfToken: token };
  });

  // Initial setup (first-time password creation)
  fastify.post<{ Body: SetupBody }>('/api/auth/setup', async (request, reply) => {
    const config = loadConfig();

    // Only allow if not already set up
    if (isPasswordHashSet(config.admin?.passwordHash)) {
      return reply.status(403).send({ error: 'Admin account already configured' });
    }

    const { username, password, confirmPassword } = request.body;

    if (!username || username.length < 3) {
      return reply.status(400).send({ error: 'Username must be at least 3 characters' });
    }

    if (!password || password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    if (password !== confirmPassword) {
      return reply.status(400).send({ error: 'Passwords do not match' });
    }

    // Hash and save
    const passwordHash = await hashPassword(password);
    config.admin = { username, passwordHash };
    saveConfig(config);

    // Auto-login after setup
    request.session.set('authenticated', true);
    request.session.set('username', username);

    log.info({ username }, 'Admin account created');
    return { success: true };
  });

  // Login
  fastify.post<{ Body: LoginBody }>(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '5 minutes',
        },
      },
    },
    async (request, reply) => {
      const config = loadConfig();

      if (!isPasswordHashSet(config.admin?.passwordHash)) {
        return reply.status(400).send({ error: 'Admin account not set up' });
      }

      const { username, password } = request.body;

      // Constant-time comparison for username to prevent timing attacks
      const expectedUsername = config.admin.username;
      const usernameMatch =
        username.length === expectedUsername.length &&
        crypto.timingSafeEqual(Buffer.from(username), Buffer.from(expectedUsername));

      // Always verify password to prevent timing attacks
      const passwordValid = await verifyPassword(password || '', config.admin.passwordHash);

      if (!usernameMatch || !passwordValid) {
        log.warn({ username, ip: request.ip }, 'Failed login attempt');
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Set session
      request.session.set('authenticated', true);
      request.session.set('username', username);

      log.info({ username, ip: request.ip }, 'Successful login');
      return { success: true };
    }
  );

  // Logout
  fastify.post('/api/auth/logout', async (request: FastifyRequest) => {
    request.session.delete();
    return { success: true };
  });

  // Change password (requires authentication)
  fastify.post<{ Body: ChangePasswordBody }>(
    '/api/auth/change-password',
    async (request, reply) => {
      if (!request.session?.get('authenticated')) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const config = loadConfig();
      const { currentPassword, newPassword } = request.body;

      const valid = await verifyPassword(currentPassword, config.admin.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      if (!newPassword || newPassword.length < 8) {
        return reply.status(400).send({ error: 'New password must be at least 8 characters' });
      }

      config.admin.passwordHash = await hashPassword(newPassword);
      saveConfig(config);

      log.info('Password changed');
      return { success: true };
    }
  );
}
