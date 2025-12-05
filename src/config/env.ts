import { z } from 'zod';

/**
 * Environment variable schema with validation
 */
export const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3030),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // AI
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  AI_MODEL: z.string().default('gpt-4-turbo'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().startsWith('+'),

  // Sonarr
  SONARR_URL: z.string().url(),
  SONARR_API_KEY: z.string().min(1),
  SONARR_QUALITY_PROFILE_ID: z.coerce.number().default(1),
  SONARR_ROOT_FOLDER: z.string().default('/tv'),

  // Radarr
  RADARR_URL: z.string().url(),
  RADARR_API_KEY: z.string().min(1),
  RADARR_QUALITY_PROFILE_ID: z.coerce.number().default(1),
  RADARR_ROOT_FOLDER: z.string().default('/movies'),

  // Security
  ALLOWED_PHONE_NUMBERS: z
    .string()
    .transform((val) => val.split(',').map((n) => n.trim()).filter(Boolean))
    .pipe(z.array(z.string().startsWith('+'))),

  // Session
  SESSION_TIMEOUT_MS: z.coerce.number().default(300000),
  MAX_SEARCH_RESULTS: z.coerce.number().default(5),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables and return typed config
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, messages]) => `  ${key}: ${messages?.join(', ')}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  // Validate AI provider has corresponding API key
  const env = result.data;
  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER is "openai"');
  }
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER is "anthropic"');
  }

  return env;
}
