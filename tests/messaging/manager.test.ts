import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagingManager } from '../../src/messaging/manager.js';
import type { MessagingProvider, MessageResponse, PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('MessagingManager', () => {
  let manager: MessagingManager;

  const createMockProvider = (platform: 'sms' | 'telegram' | 'discord' | 'slack', enabled = true): MessagingProvider => ({
    platform,
    isEnabled: enabled,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    manager = new MessagingManager(logger);
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('sms');
      manager.registerProvider(provider);

      expect(manager.getProvider('sms')).toBe(provider);
    });

    it('should replace existing provider for same platform', () => {
      const provider1 = createMockProvider('sms');
      const provider2 = createMockProvider('sms');

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      expect(manager.getProvider('sms')).toBe(provider2);
    });
  });

  describe('getProvider', () => {
    it('should return undefined for unregistered platform', () => {
      expect(manager.getProvider('telegram')).toBeUndefined();
    });

    it('should return registered provider', () => {
      const provider = createMockProvider('discord');
      manager.registerProvider(provider);

      expect(manager.getProvider('discord')).toBe(provider);
    });
  });

  describe('getEnabledProviders', () => {
    it('should return only enabled providers', () => {
      const enabledProvider = createMockProvider('sms', true);
      const disabledProvider = createMockProvider('telegram', false);

      manager.registerProvider(enabledProvider);
      manager.registerProvider(disabledProvider);

      const enabled = manager.getEnabledProviders();

      expect(enabled).toHaveLength(1);
      expect(enabled[0]).toBe(enabledProvider);
    });

    it('should return empty array when no providers registered', () => {
      expect(manager.getEnabledProviders()).toEqual([]);
    });
  });

  describe('start', () => {
    it('should start all enabled providers', async () => {
      const provider1 = createMockProvider('sms', true);
      const provider2 = createMockProvider('telegram', true);
      const disabledProvider = createMockProvider('discord', false);

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);
      manager.registerProvider(disabledProvider);

      await manager.start();

      expect(provider1.start).toHaveBeenCalled();
      expect(provider2.start).toHaveBeenCalled();
      expect(disabledProvider.start).not.toHaveBeenCalled();
    });

    it('should handle provider start errors gracefully', async () => {
      const failingProvider = createMockProvider('sms', true);
      failingProvider.start = vi.fn().mockRejectedValue(new Error('Start failed'));

      manager.registerProvider(failingProvider);

      // Should not throw
      await expect(manager.start()).resolves.toBeUndefined();
    });
  });

  describe('stop', () => {
    it('should stop all providers', async () => {
      const provider1 = createMockProvider('sms', true);
      const provider2 = createMockProvider('telegram', false);

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      await manager.stop();

      expect(provider1.stop).toHaveBeenCalled();
      expect(provider2.stop).toHaveBeenCalled();
    });

    it('should handle provider stop errors gracefully', async () => {
      const failingProvider = createMockProvider('sms', true);
      failingProvider.stop = vi.fn().mockRejectedValue(new Error('Stop failed'));

      manager.registerProvider(failingProvider);

      // Should not throw
      await expect(manager.stop()).resolves.toBeUndefined();
    });
  });

  describe('handleMessage', () => {
    it('should return error when no handler set', async () => {
      const userId: PlatformUserId = 'sms:+1234567890';
      const response = await manager.handleMessage(userId, 'hello');

      expect(response.text).toBe('Service not available');
    });

    it('should call message handler and return response', async () => {
      const expectedResponse: MessageResponse = { text: 'Hello back!' };
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);

      manager.setMessageHandler(mockHandler);

      const userId: PlatformUserId = 'sms:+1234567890';
      const response = await manager.handleMessage(userId, 'hello');

      expect(mockHandler).toHaveBeenCalledWith(userId, 'hello');
      expect(response).toBe(expectedResponse);
    });
  });

  describe('sendMessage', () => {
    it('should send message via correct provider', async () => {
      const provider = createMockProvider('sms');
      manager.registerProvider(provider);

      const userId: PlatformUserId = 'sms:+1234567890';
      const response: MessageResponse = { text: 'Test message' };

      await manager.sendMessage(userId, response);

      expect(provider.sendMessage).toHaveBeenCalledWith(userId, response);
    });

    it('should not send when provider not found', async () => {
      const userId: PlatformUserId = 'telegram:123456';
      const response: MessageResponse = { text: 'Test message' };

      // Should not throw
      await expect(manager.sendMessage(userId, response)).resolves.toBeUndefined();
    });

    it('should not send when provider is disabled', async () => {
      const provider = createMockProvider('sms', false);
      manager.registerProvider(provider);

      const userId: PlatformUserId = 'sms:+1234567890';
      const response: MessageResponse = { text: 'Test message' };

      await manager.sendMessage(userId, response);

      expect(provider.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('setMessageHandler', () => {
    it('should set the message handler', async () => {
      const handler = vi.fn().mockResolvedValue({ text: 'ok' });
      manager.setMessageHandler(handler);

      const userId: PlatformUserId = 'sms:+1234567890';
      await manager.handleMessage(userId, 'test');

      expect(handler).toHaveBeenCalledWith(userId, 'test');
    });
  });
});
