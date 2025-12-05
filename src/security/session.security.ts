import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SESSION_KEY_FILE = process.env.SESSION_KEY_FILE || join(process.cwd(), 'config', '.session-key');

/**
 * Get or generate a 32-byte session encryption key.
 * The key is persisted to disk so sessions survive restarts.
 */
export function getOrGenerateSessionKey(): Buffer {
  if (existsSync(SESSION_KEY_FILE)) {
    try {
      const keyHex = readFileSync(SESSION_KEY_FILE, 'utf-8').trim();
      const key = Buffer.from(keyHex, 'hex');
      if (key.length === 32) {
        return key;
      }
    } catch {
      // Fall through to generate new key
    }
  }

  // Generate new 32-byte key
  const key = crypto.randomBytes(32);
  writeFileSync(SESSION_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}
