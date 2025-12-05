import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isPasswordHashSet,
} from '../../src/security/password.security.js';

describe('password security', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2b$')).toBe(true); // bcrypt prefix
    });

    it('should generate different hashes for same password', async () => {
      const password = 'samePassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const hash = await hashPassword('');

      expect(hash).toBeDefined();
      expect(hash.startsWith('$2b$')).toBe(true);
    });

    it('should handle special characters', async () => {
      const password = 'p@$$w0rd!#%^&*()';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.startsWith('$2b$')).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const isValid = await verifyPassword('anyPassword', '');

      expect(isValid).toBe(false);
    });

    it('should handle case sensitivity', async () => {
      const password = 'CaseSensitive';
      const hash = await hashPassword(password);

      const isValidLower = await verifyPassword('casesensitive', hash);
      const isValidUpper = await verifyPassword('CASESENSITIVE', hash);
      const isValidCorrect = await verifyPassword('CaseSensitive', hash);

      expect(isValidLower).toBe(false);
      expect(isValidUpper).toBe(false);
      expect(isValidCorrect).toBe(true);
    });
  });

  describe('isPasswordHashSet', () => {
    it('should return true for valid hash', () => {
      const hash = '$2b$12$somevalidhashstring';
      expect(isPasswordHashSet(hash)).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(isPasswordHashSet(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPasswordHashSet('')).toBe(false);
    });

    it('should return true for any non-empty string', () => {
      expect(isPasswordHashSet('anystring')).toBe(true);
    });
  });
});
