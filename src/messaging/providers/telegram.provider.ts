import { Bot, type Context } from 'grammy';
import type { Logger } from '../../utils/logger.js';
import type { MessagingProvider, PlatformUserId, MessageHandlerCallback, MessageResponse } from '../types.js';
import type { SessionService } from '../../services/session.service.js';
import {
  formatTelegramResponse,
  parseCallbackData,
  type TelegramFormattedResponse,
} from '../formatters/telegram.formatter.js';
import { createPlatformUserId } from '../types.js';

/**
 * Telegram configuration
 */
export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  allowedChatIds?: string[];
  usePolling?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}

/**
 * Telegram messaging provider using grammy
 */
export class TelegramProvider implements MessagingProvider {
  readonly platform = 'telegram' as const;
  private readonly config: TelegramConfig;
  private readonly logger: Logger;
  private readonly sessionService: SessionService;
  private bot: Bot | null = null;
  private messageHandler?: MessageHandlerCallback;
  private started = false;

  constructor(config: TelegramConfig, sessionService: SessionService, logger: Logger) {
    this.config = config;
    this.sessionService = sessionService;
    this.logger = logger.child({ provider: 'telegram' });
  }

  get isEnabled(): boolean {
    return this.config.enabled && !!this.config.botToken;
  }

  /**
   * Set the message handler callback
   */
  setMessageHandler(handler: MessageHandlerCallback): void {
    this.messageHandler = handler;
  }

  /**
   * Start the Telegram bot
   */
  async start(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.info('Telegram provider is disabled');
      return;
    }

    if (this.started) {
      this.logger.warn('Telegram provider already started');
      return;
    }

    this.logger.info('Starting Telegram provider');

    this.bot = new Bot(this.config.botToken);

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        'Welcome to Textarr! I can help you request movies and TV shows.\n\n' +
        'Just tell me what you want to add, like:\n' +
        '• "Add Breaking Bad"\n' +
        '• "Add Dune 2021"\n' +
        '• "Add Attack on Titan anime"\n\n' +
        'Type "help" for more commands.',
        { parse_mode: 'HTML' }
      );
    });

    // Handle /help command
    this.bot.command('help', async (ctx) => {
      await this.handleTextMessage(ctx, 'help');
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      await this.handleTextMessage(ctx, ctx.message.text);
    });

    // Handle callback queries (button clicks)
    this.bot.on('callback_query:data', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    // Error handling
    this.bot.catch((err) => {
      this.logger.error({ error: err }, 'Telegram bot error');
    });

    // Start the bot
    if (this.config.usePolling !== false) {
      // Use polling (default for development)
      void this.bot.start({
        onStart: (botInfo) => {
          this.logger.info({ username: botInfo.username }, 'Telegram bot started with polling');
        },
      });
    }

    this.started = true;
  }

  /**
   * Stop the Telegram bot
   */
  async stop(): Promise<void> {
    if (this.bot && this.started) {
      this.logger.info('Stopping Telegram provider');
      await this.bot.stop();
      this.started = false;
    }
  }

  /**
   * Send a message to a Telegram user
   */
  async sendMessage(userId: PlatformUserId, response: MessageResponse): Promise<void> {
    if (!this.bot) {
      this.logger.error('Telegram bot not initialized');
      return;
    }

    const [, chatId] = userId.split(':');
    if (!chatId) {
      this.logger.error({ userId }, 'Invalid Telegram user ID');
      return;
    }

    // Get session state for context-aware formatting
    const session = this.sessionService.getSession(userId);
    const formatted = formatTelegramResponse(response, session.state, session.pendingResults);

    await this.sendFormattedMessage(chatId, formatted);
  }

  /**
   * Handle incoming text messages
   */
  private async handleTextMessage(ctx: Context, text: string): Promise<void> {
    if (!ctx.from) {
      this.logger.warn('Message without from field');
      return;
    }

    const chatId = String(ctx.chat?.id || ctx.from.id);

    // Check if chat is allowed (if whitelist is configured)
    if (this.config.allowedChatIds && this.config.allowedChatIds.length > 0) {
      if (!this.config.allowedChatIds.includes(chatId)) {
        this.logger.warn({ chatId }, 'Message from non-whitelisted chat');
        return;
      }
    }

    const userId = createPlatformUserId('telegram', String(ctx.from.id));

    this.logger.info({ userId, text }, 'Received Telegram message');

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      await ctx.reply('Service not available');
      return;
    }

    try {
      // Send typing indicator
      await ctx.replyWithChatAction('typing');

      // Process the message
      const response = await this.messageHandler(userId, text);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatTelegramResponse(response, session.state, session.pendingResults);

      await this.sendFormattedMessage(chatId, formatted);
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Telegram message');
      await ctx.reply('Something went wrong. Please try again.');
    }
  }

  /**
   * Handle callback queries (button clicks)
   */
  private async handleCallbackQuery(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery?.data || !ctx.from) {
      return;
    }

    const chatId = String(ctx.chat?.id || ctx.from.id);
    const userId = createPlatformUserId('telegram', String(ctx.from.id));
    const data = ctx.callbackQuery.data;

    this.logger.info({ userId, data }, 'Received Telegram callback');

    // Acknowledge the callback immediately
    await ctx.answerCallbackQuery();

    // Parse the callback data to determine action
    const { action, value } = parseCallbackData(data);

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      return;
    }

    try {
      // Convert callback action to text message for handler
      let message: string;
      switch (action) {
        case 'select':
          message = String(value);
          break;
        case 'season_select':
          message = String(value);
          break;
        case 'confirm':
          message = 'yes';
          break;
        case 'cancel':
          message = 'cancel';
          break;
        case 'anime_confirm':
          message = 'anime';
          break;
        case 'regular_confirm':
          message = 'regular';
          break;
        case 'back':
          message = 'back';
          break;
        default:
          this.logger.warn({ action }, 'Unknown callback action');
          return;
      }

      // Process the converted message
      const response = await this.messageHandler(userId, message);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatTelegramResponse(response, session.state, session.pendingResults);

      // Edit the original message if possible, otherwise send new one
      try {
        if (formatted.photoUrl) {
          // For messages with photos, we need to send a new message
          await this.sendFormattedMessage(chatId, formatted);
          // Try to delete the old message
          await ctx.deleteMessage();
        } else if (formatted.keyboard) {
          await ctx.editMessageText(formatted.text, {
            parse_mode: formatted.parseMode,
            reply_markup: formatted.keyboard,
          });
        } else {
          await ctx.editMessageText(formatted.text, {
            parse_mode: formatted.parseMode,
          });
        }
      } catch {
        // If edit fails, send new message
        await this.sendFormattedMessage(chatId, formatted);
      }
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Telegram callback');
      await ctx.reply('Something went wrong. Please try again.');
    }
  }

  /**
   * Send a formatted message to a chat
   */
  private async sendFormattedMessage(chatId: string, formatted: TelegramFormattedResponse): Promise<void> {
    if (!this.bot) return;

    try {
      if (formatted.photoUrl) {
        // Send as photo with caption
        await this.bot.api.sendPhoto(chatId, formatted.photoUrl, {
          caption: formatted.text,
          parse_mode: formatted.parseMode,
          reply_markup: formatted.keyboard,
        });
      } else {
        // Send as text message
        await this.bot.api.sendMessage(chatId, formatted.text, {
          parse_mode: formatted.parseMode,
          reply_markup: formatted.keyboard,
        });
      }
    } catch (error) {
      this.logger.error({ error, chatId }, 'Failed to send Telegram message');
      // Fallback: try sending without formatting
      try {
        await this.bot.api.sendMessage(chatId, formatted.text.replace(/<[^>]*>/g, ''));
      } catch (fallbackError) {
        this.logger.error({ error: fallbackError, chatId }, 'Failed to send fallback message');
      }
    }
  }

  /**
   * Get the bot instance (for webhook handling)
   */
  getBot(): Bot | null {
    return this.bot;
  }
}
