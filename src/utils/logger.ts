import Pino from 'pino';

export type Logger = Pino.Logger;

// Handle both ESM and CommonJS module systems
const pino = (Pino as unknown as { default?: typeof Pino }).default || Pino;

/**
 * Check if pino-pretty is available (dev dependency)
 */
function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a configured pino logger
 */
export function createLogger(level: string, isDev: boolean): Logger {
  // Only use pino-pretty in dev mode AND when it's available
  if (isDev && isPinoPrettyAvailable()) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino({ level });
}
