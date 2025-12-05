import { App, type BlockAction } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';
import type { MessagingProvider, PlatformUserId, MessageHandlerCallback, MessageResponse } from '../types.js';
import type { SessionService } from '../../services/session.service.js';
import { formatSlackResponse, parseSlackActionId } from '../formatters/slack.formatter.js';
import { createPlatformUserId } from '../types.js';

/**
 * Type for Slack's say function
 */
type SayFn = (message: string | { text: string; blocks?: unknown[] }) => Promise<unknown>;

/**
 * Simplified Slack message event type
 */
interface SlackMessageEvent {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  channel: string;
  bot_id?: string;
}

/**
 * Slack configuration
 */
export interface SlackConfig {
  enabled: boolean;
  botToken: string;
  signingSecret: string;
  appToken?: string;
  useSocketMode?: boolean;
}

/**
 * Slack messaging provider using Slack Bolt
 */
export class SlackProvider implements MessagingProvider {
  readonly platform = 'slack' as const;
  private readonly config: SlackConfig;
  private readonly logger: Logger;
  private readonly sessionService: SessionService;
  private app: App | null = null;
  private messageHandler?: MessageHandlerCallback;
  private started = false;

  constructor(config: SlackConfig, sessionService: SessionService, logger: Logger) {
    this.config = config;
    this.sessionService = sessionService;
    this.logger = logger.child({ provider: 'slack' });
  }

  get isEnabled(): boolean {
    return this.config.enabled && !!this.config.botToken && !!this.config.signingSecret;
  }

  /**
   * Set the message handler callback
   */
  setMessageHandler(handler: MessageHandlerCallback): void {
    this.messageHandler = handler;
  }

  /**
   * Start the Slack bot
   */
  async start(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.info('Slack provider is disabled');
      return;
    }

    if (this.started) {
      this.logger.warn('Slack provider already started');
      return;
    }

    this.logger.info('Starting Slack provider');

    // Configure app based on socket mode or HTTP mode
    const appConfig: ConstructorParameters<typeof App>[0] = {
      token: this.config.botToken,
      signingSecret: this.config.signingSecret,
    };

    if (this.config.useSocketMode && this.config.appToken) {
      appConfig.socketMode = true;
      appConfig.appToken = this.config.appToken;
    }

    this.app = new App(appConfig);

    // Handle messages (both DMs and mentions)
    this.app.message(async ({ message, say }) => {
      await this.handleMessage(message as SlackMessageEvent, say as SayFn);
    });

    // Handle button actions
    // We need to register handlers for each action ID pattern
    this.app.action(/^select_\d+$/, async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action(/^season_\d+$/, async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action('confirm_yes', async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action('confirm_no', async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action('anime_yes', async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action('anime_no', async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    this.app.action('cancel', async ({ ack, body, client }) => {
      await this.handleAction(ack, body as BlockAction, client);
    });

    // Error handling
    this.app.error(async (error) => {
      this.logger.error({ error }, 'Slack app error');
    });

    // Start the app
    await this.app.start();
    this.started = true;
    this.logger.info('Slack bot started');
  }

  /**
   * Stop the Slack bot
   */
  async stop(): Promise<void> {
    if (this.app && this.started) {
      this.logger.info('Stopping Slack provider');
      await this.app.stop();
      this.started = false;
    }
  }

  /**
   * Send a message to a Slack user
   */
  async sendMessage(userId: PlatformUserId, response: MessageResponse): Promise<void> {
    if (!this.app) {
      this.logger.error('Slack app not initialized');
      return;
    }

    const [, slackUserId] = userId.split(':');
    if (!slackUserId) {
      this.logger.error({ userId }, 'Invalid Slack user ID');
      return;
    }

    try {
      const session = this.sessionService.getSession(userId);
      const formatted = formatSlackResponse(response, session.state, session.pendingResults);

      // Open a DM channel with the user
      const result = await this.app.client.conversations.open({
        users: slackUserId,
      });

      if (result.channel?.id) {
        await this.app.client.chat.postMessage({
          channel: result.channel.id,
          text: formatted.text,
          blocks: formatted.blocks,
        });
      }
    } catch (error) {
      this.logger.error({ error, userId }, 'Failed to send Slack message');
    }
  }

  /**
   * Handle incoming Slack messages
   */
  private async handleMessage(
    message: SlackMessageEvent,
    say: SayFn
  ): Promise<void> {
    // Ignore bot messages and messages without text
    if ('bot_id' in message || !('text' in message) || !message.text) {
      return;
    }

    const slackUserId = message.user;
    if (!slackUserId) {
      this.logger.warn('Message without user ID');
      return;
    }

    const userId = createPlatformUserId('slack', slackUserId);
    const content = message.text;

    this.logger.info({ userId, content }, 'Received Slack message');

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      return;
    }

    try {
      // Process the message
      const response = await this.messageHandler(userId, content);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatSlackResponse(response, session.state, session.pendingResults);

      // Reply with formatted blocks
      await say({
        text: formatted.text,
        blocks: formatted.blocks,
      });
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Slack message');
      await say('Something went wrong. Please try again.');
    }
  }

  /**
   * Handle Slack button actions
   */
  private async handleAction(
    ack: () => Promise<void>,
    body: BlockAction,
    client: App['client']
  ): Promise<void> {
    // Acknowledge immediately
    await ack();

    const slackUserId = body.user.id;
    const userId = createPlatformUserId('slack', slackUserId);

    // Get the action ID from the first action
    const action = body.actions[0];
    if (!action || !('action_id' in action)) {
      this.logger.warn('Action missing action_id');
      return;
    }
    const actionId = action.action_id;

    this.logger.info({ userId, actionId }, 'Received Slack button action');

    // Parse the action ID to determine action type
    const { action: actionType, value } = parseSlackActionId(actionId);

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      return;
    }

    try {
      // Convert action to text message for handler
      let message: string;
      switch (actionType) {
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
        default:
          this.logger.warn({ actionType }, 'Unknown action type');
          return;
      }

      // Process the converted message
      const response = await this.messageHandler(userId, message);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatSlackResponse(response, session.state, session.pendingResults);

      // Update the original message
      if (body.channel?.id && body.message?.ts) {
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          text: formatted.text,
          blocks: formatted.blocks,
        });
      }
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Slack action');

      // Send error message
      if (body.channel?.id) {
        await client.chat.postMessage({
          channel: body.channel.id,
          text: 'Something went wrong. Please try again.',
        });
      }
    }
  }

  /**
   * Get the Slack app instance (for advanced use cases)
   */
  getApp(): App | null {
    return this.app;
  }
}
