import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.LOG_LEVEL = 'silent';

  process.env.AI_PROVIDER = 'openai';
  process.env.AI_MODEL = 'gpt-4-turbo';
  process.env.OPENAI_API_KEY = 'sk-test-key';

  process.env.TWILIO_ACCOUNT_SID = 'ACtest123456789';
  process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
  process.env.TWILIO_PHONE_NUMBER = '+15555555555';

  process.env.SONARR_URL = 'http://localhost:8989';
  process.env.SONARR_API_KEY = 'sonarr-test-key';
  process.env.SONARR_QUALITY_PROFILE_ID = '1';
  process.env.SONARR_ROOT_FOLDER = '/tv';

  process.env.RADARR_URL = 'http://localhost:7878';
  process.env.RADARR_API_KEY = 'radarr-test-key';
  process.env.RADARR_QUALITY_PROFILE_ID = '1';
  process.env.RADARR_ROOT_FOLDER = '/movies';

  process.env.ALLOWED_PHONE_NUMBERS = '+1234567890,+0987654321';
  process.env.SESSION_TIMEOUT_MS = '300000';
  process.env.MAX_SEARCH_RESULTS = '5';
});

afterAll(() => {
  vi.restoreAllMocks();
});
