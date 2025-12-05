import twilio from 'twilio';
import type { Logger } from '../utils/logger.js';
import { TwilioError } from '../utils/errors.js';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  sendPosterImages: boolean;
}

/**
 * Message options for sending SMS/MMS
 */
export interface SendMessageOptions {
  /** Message body text */
  body: string;
  /** Optional media URLs for MMS (poster images) */
  mediaUrls?: string[];
}

/**
 * Twilio service for sending SMS/MMS messages
 */
export class TwilioService {
  private readonly client: twilio.Twilio;
  private readonly phoneNumber: string;
  private readonly authToken: string;
  private readonly sendPosterImages: boolean;
  private readonly logger: Logger;

  constructor(config: TwilioConfig, logger: Logger) {
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
    this.authToken = config.authToken;
    this.sendPosterImages = config.sendPosterImages;
    this.logger = logger.child({ service: 'twilio' });
    
    if (this.sendPosterImages) {
      this.logger.info('MMS poster images enabled');
    }
  }

  /**
   * Check if poster images should be sent
   */
  shouldSendPosterImages(): boolean {
    return this.sendPosterImages;
  }

  /**
   * Send an SMS or MMS message
   * 
   * @param to - Recipient phone number
   * @param options - Message options (body and optional mediaUrls)
   * @returns Message SID
   */
  async sendMessage(to: string, options: SendMessageOptions | string): Promise<string> {
    // Support both string and options object for backwards compatibility
    const messageOptions = typeof options === 'string' 
      ? { body: options } 
      : options;

    const { body, mediaUrls } = messageOptions;
    
    // Only include media URLs if poster images are enabled and URLs are provided
    const includeMedia = this.sendPosterImages && mediaUrls && mediaUrls.length > 0;
    
    this.logger.info({ 
      to, 
      bodyLength: body.length,
      hasMedia: includeMedia,
      mediaCount: includeMedia ? mediaUrls?.length : 0,
    }, includeMedia ? 'Sending MMS' : 'Sending SMS');

    try {
      // Build message params
      const messageParams: {
        from: string;
        to: string;
        body: string;
        mediaUrl?: string[];
      } = {
        from: this.phoneNumber,
        to,
        body,
      };

      // Add media URLs for MMS if enabled
      if (includeMedia && mediaUrls) {
        // Filter out any invalid URLs and limit to 10 (Twilio max)
        const validMediaUrls = mediaUrls
          .filter(url => url && url.startsWith('http'))
          .slice(0, 10);
        
        if (validMediaUrls.length > 0) {
          messageParams.mediaUrl = validMediaUrls;
        }
      }

      const message = await this.client.messages.create(messageParams);

      this.logger.debug({ 
        sid: message.sid, 
        status: message.status,
        numMedia: message.numMedia,
      }, 'Message sent');
      
      return message.sid;
    } catch (error) {
      this.logger.error({ error, to }, 'Failed to send message');
      throw new TwilioError(`Failed to send message: ${String(error)}`);
    }
  }

  /**
   * Validate Twilio webhook signature
   */
  validateWebhook(signature: string, url: string, params: Record<string, string>): boolean {
    return twilio.validateRequest(this.authToken, signature, url, params);
  }

  /**
   * Generate TwiML response for webhook
   * 
   * @param body - Message body text
   * @param mediaUrls - Optional media URLs for MMS
   */
  generateTwiML(body: string, mediaUrls?: string[]): string {
    const response = new twilio.twiml.MessagingResponse();
    
    // Create message with body text (required parameter)
    const message = response.message(body);
    
    // Add media if poster images are enabled
    if (this.sendPosterImages && mediaUrls && mediaUrls.length > 0) {
      for (const url of mediaUrls.slice(0, 10)) {
        if (url && url.startsWith('http')) {
          message.media(url);
        }
      }
    }
    
    return response.toString();
  }

  /**
   * Generate empty TwiML response (for silent responses)
   */
  generateEmptyTwiML(): string {
    const response = new twilio.twiml.MessagingResponse();
    return response.toString();
  }
}
