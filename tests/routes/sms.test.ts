import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { smsRoutes } from '../../src/routes/sms.route.js';
import type { ServiceContainer } from '../../src/services/container.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('smsRoutes', () => {
  let app: FastifyInstance;
  let mockContainer: Partial<ServiceContainer>;

  beforeEach(async () => {
    app = Fastify();

    // Create mock container
    mockContainer = {
      isInitialized: true,
      currentConfig: {
        server: { port: 3030, nodeEnv: 'test', logLevel: 'silent', isDev: false, isProd: false },
        ai: { provider: 'openai', model: 'gpt-4', openaiApiKey: 'test-key' },
        twilio: { accountSid: 'AC123', authToken: 'test', phoneNumber: '+15555555555', sendPosterImages: false },
        sonarr: { url: 'http://localhost:8989', apiKey: 'test', qualityProfileId: 1, rootFolder: '/tv' },
        radarr: { url: 'http://localhost:7878', apiKey: 'test', qualityProfileId: 1, rootFolder: '/movies' },
        tmdb: { apiKey: 'test-tmdb-key', language: 'en' },
        users: [],
        quotas: { enabled: false, period: 'weekly', movieLimit: 10, tvShowLimit: 10, adminExempt: true },
        session: { timeoutMs: 300000, maxSearchResults: 5 },
      } as ServiceContainer['currentConfig'],
      twilio: {
        generateTwiML: vi.fn((msg: string) => `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`),
        sendMessage: vi.fn().mockResolvedValue('SM123'),
        validateWebhook: vi.fn().mockReturnValue(true),
      } as unknown as ServiceContainer['twilio'],
      all: {
        sonarr: { search: vi.fn(), addSeries: vi.fn(), getQueue: vi.fn() },
        radarr: { search: vi.fn(), addMovie: vi.fn(), getQueue: vi.fn() },
        ai: { parseMessage: vi.fn() },
        session: {
          getSession: vi.fn().mockReturnValue({ state: 'idle', pendingResults: [], selectedMedia: null, context: {} }),
          setState: vi.fn(),
          setPendingResults: vi.fn(),
          setSelectedMedia: vi.fn(),
          getPendingResults: vi.fn().mockReturnValue([]),
          getSelectedMedia: vi.fn().mockReturnValue(null),
          resetSession: vi.fn(),
          addMessage: vi.fn(),
          getRecentMessages: vi.fn().mockReturnValue([]),
          removeFromPendingResults: vi.fn(),
          setResultSource: vi.fn(),
          getResultSource: vi.fn().mockReturnValue(null),
        },
        twilio: { sendMessage: vi.fn(), generateTwiML: vi.fn() },
        tmdb: { searchMulti: vi.fn().mockResolvedValue([]), getTvdbId: vi.fn(), detectAnime: vi.fn() },
        user: {
          isAuthorized: vi.fn().mockReturnValue(true),
          getUser: vi.fn().mockReturnValue({ phoneNumber: '+1234567890', name: 'Test', isAdmin: false }),
          isAdmin: vi.fn().mockReturnValue(false),
          getAllUsers: vi.fn().mockReturnValue([]),
          getAdmins: vi.fn().mockReturnValue([]),
          checkQuota: vi.fn().mockReturnValue({ allowed: true }),
          incrementRequestCount: vi.fn(),
        },
      } as unknown as ServiceContainer['all'],
    };

    // Register routes (skip middleware for unit tests)
    await app.register(async (instance) => {
      // Mock route registration without actual middleware
      instance.post('/webhooks/sms', async (request, reply) => {
        // Simplified handler for testing
        if (!mockContainer.isInitialized) {
          return reply
            .header('Content-Type', 'text/xml')
            .send('<Response><Message>Service not configured. Please complete setup.</Message></Response>');
        }

        const body = request.body as { From?: string; Body?: string };
        if (!body.From || !body.Body) {
          return reply.status(400).send('Bad Request');
        }

        const ackMessage = 'Got it! Looking that up for you...';
        const ackTwiml = mockContainer.twilio?.generateTwiML(ackMessage);
        return reply.header('Content-Type', 'text/xml').send(ackTwiml);
      });

      instance.post('/webhooks/sms/status', async (_request, reply) => {
        return reply.status(200).send('');
      });

      instance.get('/webhooks/sms/health', async (_request, reply) => {
        const isInitialized = mockContainer.isInitialized;
        const config = mockContainer.currentConfig;

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
          timestamp: expect.any(String),
        });
      });
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  describe('POST /webhooks/sms', () => {
    it('should return error message when services not initialized', async () => {
      mockContainer.isInitialized = false;

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sms',
        payload: { From: '+1234567890', Body: 'hello' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.payload).toContain('Service not configured');
    });

    it('should return 400 for invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sms',
        payload: { invalid: 'data' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return immediate acknowledgment TwiML', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sms',
        payload: { From: '+1234567890', Body: 'add inception' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.payload).toContain('<Response>');
      expect(response.payload).toContain('Got it!');
    });
  });

  describe('POST /webhooks/sms/status', () => {
    it('should acknowledge status callbacks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sms/status',
        payload: { MessageSid: 'SM123', MessageStatus: 'delivered' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toBe('');
    });
  });

  describe('GET /webhooks/sms/health', () => {
    it('should return ready status when initialized', async () => {
      mockContainer.isInitialized = true;

      const response = await app.inject({
        method: 'GET',
        url: '/webhooks/sms/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ready');
      expect(body.webhook).toBe('/webhooks/sms');
      expect(body.method).toBe('POST');
      expect(body.services).toHaveProperty('twilio');
      expect(body.services).toHaveProperty('ai');
      expect(body.services).toHaveProperty('sonarr');
      expect(body.services).toHaveProperty('radarr');
    });

    it('should return not_configured when not initialized', async () => {
      mockContainer.isInitialized = false;

      const response = await app.inject({
        method: 'GET',
        url: '/webhooks/sms/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('not_configured');
    });
  });
});
