import { z } from 'zod';

/**
 * Twilio incoming SMS webhook payload
 * @see https://www.twilio.com/docs/messaging/guides/webhook-request
 */
export const TwilioWebhookPayloadSchema = z.object({
  // Required fields
  MessageSid: z.string(),
  AccountSid: z.string(),
  From: z.string(), // User's phone number (E.164 format)
  To: z.string(), // Your Twilio number
  Body: z.string(), // Message content

  // Optional fields
  NumMedia: z.coerce.number().optional(),
  NumSegments: z.coerce.number().optional(),
  SmsStatus: z.string().optional(),
  ApiVersion: z.string().optional(),
  FromCity: z.string().optional(),
  FromState: z.string().optional(),
  FromZip: z.string().optional(),
  FromCountry: z.string().optional(),
  ToCity: z.string().optional(),
  ToState: z.string().optional(),
  ToZip: z.string().optional(),
  ToCountry: z.string().optional(),
});

export type TwilioWebhookPayload = z.infer<typeof TwilioWebhookPayloadSchema>;

/**
 * Twilio message status callback payload
 */
export const TwilioStatusCallbackSchema = z.object({
  MessageSid: z.string(),
  MessageStatus: z.enum([
    'accepted',
    'queued',
    'sending',
    'sent',
    'failed',
    'delivered',
    'undelivered',
    'receiving',
    'received',
    'read',
  ]),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});

export type TwilioStatusCallback = z.infer<typeof TwilioStatusCallbackSchema>;
