import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../../src/services/ai.service.js';
import pino from 'pino';
import { generateObject } from 'ai';

const logger = pino({ level: 'silent' });

// Mock the AI SDK with v5 createOpenAI/createAnthropic/createGoogleGenerativeAI pattern
vi.mock('ai', () => ({
  generateObject: vi.fn(),
  NoObjectGeneratedError: {
    isInstance: vi.fn(() => false),
  },
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({}))),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({}))),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))),
}));

const mockGenerateObject = vi.mocked(generateObject);

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    aiService = new AIService(
      {
        provider: 'openai',
        model: 'gpt-4-turbo',
        openaiApiKey: 'sk-test-key',
      },
      logger
    );
  });

  describe('parseMessage - simple responses', () => {
    it('should parse "yes" as confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'confirm',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('yes');

      expect(result.action).toBe('confirm');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "y" as confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'confirm',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 0.95,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('y');

      expect(result.action).toBe('confirm');
    });

    it('should parse "no" as cancel action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'cancel',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('no');

      expect(result.action).toBe('cancel');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "cancel" as cancel action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'cancel',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('cancel');

      expect(result.action).toBe('cancel');
    });

    it('should parse number as select action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'select',
          selectionNumber: 3,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('3');

      expect(result.action).toBe('select');
      expect(result.selectionNumber).toBe(3);
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "help" as help action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'help',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('help');

      expect(result.action).toBe('help');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "?" as help action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'help',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 0.95,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('?');

      expect(result.action).toBe('help');
    });

    it('should parse "anime" as anime_confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'anime_confirm',
          selectionNumber: null,
          isAnimeRequest: true,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('anime');

      expect(result.action).toBe('anime_confirm');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "a" as anime_confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'anime_confirm',
          selectionNumber: null,
          isAnimeRequest: true,
          confidence: 0.95,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('a');

      expect(result.action).toBe('anime_confirm');
    });

    it('should parse "regular" as regular_confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'regular_confirm',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 1.0,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('regular');

      expect(result.action).toBe('regular_confirm');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse "r" as regular_confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'regular_confirm',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 0.95,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('r');

      expect(result.action).toBe('regular_confirm');
    });

    it('should parse "not anime" as regular_confirm action', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: null,
          year: null,
          action: 'regular_confirm',
          selectionNumber: null,
          isAnimeRequest: false,
          confidence: 0.95,
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as never);

      const result = await aiService.parseMessage('not anime');

      expect(result.action).toBe('regular_confirm');
    });
  });

  describe('constructor', () => {
    it('should throw error if OpenAI key missing', () => {
      expect(() => {
        new AIService(
          {
            provider: 'openai',
            model: 'gpt-4',
            openaiApiKey: undefined,
          },
          logger
        );
      }).toThrow('OpenAI API key is required');
    });

    it('should throw error if Anthropic key missing', () => {
      expect(() => {
        new AIService(
          {
            provider: 'anthropic',
            model: 'claude-3-opus',
            anthropicApiKey: undefined,
          },
          logger
        );
      }).toThrow('Anthropic API key is required');
    });

    it('should throw error if Google key missing', () => {
      expect(() => {
        new AIService(
          {
            provider: 'google',
            model: 'gemini-1.5-pro',
            googleApiKey: undefined,
          },
          logger
        );
      }).toThrow('Google API key is required');
    });

    it('should initialize with Google provider', () => {
      expect(() => {
        new AIService(
          {
            provider: 'google',
            model: 'gemini-1.5-pro',
            googleApiKey: 'test-google-key',
          },
          logger
        );
      }).not.toThrow();
    });
  });
});
