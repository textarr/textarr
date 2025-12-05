import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwilioService } from '../../src/services/twilio.service.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// Mock the twilio module
vi.mock('twilio', () => {
  const mockMessageCreate = vi.fn();
  const mockValidateRequest = vi.fn();

  // Mock TwiML MessagingResponse
  class MockMessagingResponse {
    private messages: Array<{ body: string; media: string[] }> = [];

    message(body: string) {
      const msg = { body, media: [] as string[] };
      this.messages.push(msg);
      return {
        media: (url: string) => {
          msg.media.push(url);
        },
      };
    }

    toString() {
      let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
      for (const msg of this.messages) {
        xml += `<Message>${msg.body}`;
        for (const url of msg.media) {
          xml += `<Media>${url}</Media>`;
        }
        xml += '</Message>';
      }
      xml += '</Response>';
      return xml;
    }
  }

  const mockTwilio = vi.fn(() => ({
    messages: {
      create: mockMessageCreate,
    },
  }));

  // Add validateRequest as a static property
  (mockTwilio as unknown as { validateRequest: typeof mockValidateRequest }).validateRequest = mockValidateRequest;

  // Add twiml namespace
  (mockTwilio as unknown as { twiml: { MessagingResponse: typeof MockMessagingResponse } }).twiml = {
    MessagingResponse: MockMessagingResponse,
  };

  return { default: mockTwilio };
});

// Get reference to mocked functions
const twilio = (await import('twilio')).default;
const mockMessageCreate = (twilio() as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create;
const mockValidateRequest = (twilio as unknown as { validateRequest: ReturnType<typeof vi.fn> }).validateRequest;

describe('TwilioService', () => {
  let service: TwilioService;
  let serviceWithPosterImages: TwilioService;

  const mockConfig = {
    accountSid: 'AC123',
    authToken: 'test-auth-token',
    phoneNumber: '+15555555555',
    sendPosterImages: false,
  };

  const mockConfigWithPosterImages = {
    ...mockConfig,
    sendPosterImages: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TwilioService(mockConfig, logger);
    serviceWithPosterImages = new TwilioService(mockConfigWithPosterImages, logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldSendPosterImages', () => {
    it('should return false when poster images are disabled', () => {
      expect(service.shouldSendPosterImages()).toBe(false);
    });

    it('should return true when poster images are enabled', () => {
      expect(serviceWithPosterImages.shouldSendPosterImages()).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should send SMS with string body', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM123',
        status: 'sent',
        numMedia: '0',
      });

      const result = await service.sendMessage('+1234567890', 'Hello World');

      expect(result).toBe('SM123');
      expect(mockMessageCreate).toHaveBeenCalledWith({
        from: '+15555555555',
        to: '+1234567890',
        body: 'Hello World',
      });
    });

    it('should send SMS with options object', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM456',
        status: 'sent',
        numMedia: '0',
      });

      const result = await service.sendMessage('+1234567890', { body: 'Test message' });

      expect(result).toBe('SM456');
      expect(mockMessageCreate).toHaveBeenCalledWith({
        from: '+15555555555',
        to: '+1234567890',
        body: 'Test message',
      });
    });

    it('should not send MMS when poster images disabled even if mediaUrls provided', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM789',
        status: 'sent',
        numMedia: '0',
      });

      await service.sendMessage('+1234567890', {
        body: 'Check this out',
        mediaUrls: ['https://example.com/poster.jpg'],
      });

      // Should not include mediaUrl when poster images disabled
      expect(mockMessageCreate).toHaveBeenCalledWith({
        from: '+15555555555',
        to: '+1234567890',
        body: 'Check this out',
      });
    });

    it('should send MMS when poster images enabled and mediaUrls provided', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM101',
        status: 'sent',
        numMedia: '1',
      });

      await serviceWithPosterImages.sendMessage('+1234567890', {
        body: 'Check this out',
        mediaUrls: ['https://example.com/poster.jpg'],
      });

      expect(mockMessageCreate).toHaveBeenCalledWith({
        from: '+15555555555',
        to: '+1234567890',
        body: 'Check this out',
        mediaUrl: ['https://example.com/poster.jpg'],
      });
    });

    it('should filter invalid media URLs', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM102',
        status: 'sent',
        numMedia: '1',
      });

      await serviceWithPosterImages.sendMessage('+1234567890', {
        body: 'Check this out',
        mediaUrls: [
          'https://valid.com/image.jpg',
          '',
          'invalid-url',
          'https://another-valid.com/poster.png',
        ],
      });

      expect(mockMessageCreate).toHaveBeenCalledWith({
        from: '+15555555555',
        to: '+1234567890',
        body: 'Check this out',
        mediaUrl: ['https://valid.com/image.jpg', 'https://another-valid.com/poster.png'],
      });
    });

    it('should limit media URLs to 10', async () => {
      mockMessageCreate.mockResolvedValueOnce({
        sid: 'SM103',
        status: 'sent',
        numMedia: '10',
      });

      const manyUrls = Array.from({ length: 15 }, (_, i) => `https://example.com/image${i}.jpg`);

      await serviceWithPosterImages.sendMessage('+1234567890', {
        body: 'Many images',
        mediaUrls: manyUrls,
      });

      const callArgs = mockMessageCreate.mock.calls[0][0] as { mediaUrl?: string[] };
      expect(callArgs.mediaUrl).toHaveLength(10);
    });

    it('should throw TwilioError on failure', async () => {
      mockMessageCreate.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.sendMessage('+1234567890', 'Test')).rejects.toThrow('Failed to send message');
    });
  });

  describe('validateWebhook', () => {
    it('should return true for valid signature', () => {
      mockValidateRequest.mockReturnValueOnce(true);

      const result = service.validateWebhook(
        'valid-signature',
        'https://example.com/webhook',
        { Body: 'Hello', From: '+1234567890' }
      );

      expect(result).toBe(true);
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'valid-signature',
        'https://example.com/webhook',
        { Body: 'Hello', From: '+1234567890' }
      );
    });

    it('should return false for invalid signature', () => {
      mockValidateRequest.mockReturnValueOnce(false);

      const result = service.validateWebhook(
        'invalid-signature',
        'https://example.com/webhook',
        { Body: 'Hello', From: '+1234567890' }
      );

      expect(result).toBe(false);
    });
  });

  describe('generateTwiML', () => {
    it('should generate basic TwiML response', () => {
      const result = service.generateTwiML('Hello World');

      expect(result).toContain('<Response>');
      expect(result).toContain('<Message>Hello World</Message>');
      expect(result).toContain('</Response>');
    });

    it('should not include media when poster images disabled', () => {
      const result = service.generateTwiML('Hello', ['https://example.com/image.jpg']);

      expect(result).not.toContain('<Media>');
    });

    it('should include media when poster images enabled', () => {
      const result = serviceWithPosterImages.generateTwiML('Hello', ['https://example.com/image.jpg']);

      expect(result).toContain('<Media>https://example.com/image.jpg</Media>');
    });

    it('should filter invalid media URLs in TwiML', () => {
      const result = serviceWithPosterImages.generateTwiML('Hello', [
        'https://valid.com/image.jpg',
        '',
        'invalid-url',
      ]);

      expect(result).toContain('<Media>https://valid.com/image.jpg</Media>');
      expect(result).not.toContain('<Media></Media>');
      expect(result).not.toContain('<Media>invalid-url</Media>');
    });
  });

  describe('generateEmptyTwiML', () => {
    it('should return empty messaging response', () => {
      const result = service.generateEmptyTwiML();

      expect(result).toContain('<Response>');
      expect(result).toContain('</Response>');
      expect(result).not.toContain('<Message>');
    });
  });
});
