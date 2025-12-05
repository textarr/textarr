import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type Interaction,
} from 'discord.js';
import type { Logger } from '../../utils/logger.js';
import type { MessagingProvider, PlatformUserId, MessageHandlerCallback, MessageResponse } from '../types.js';
import type { SessionService } from '../../services/session.service.js';
import {
  formatDiscordResponse,
  parseDiscordButtonId,
} from '../formatters/discord.formatter.js';
import { createPlatformUserId } from '../types.js';

/**
 * Discord configuration
 */
export interface DiscordConfig {
  enabled: boolean;
  botToken: string;
  allowedGuildIds?: string[];
  allowedChannelIds?: string[];
}

/**
 * Discord messaging provider using discord.js
 */
export class DiscordProvider implements MessagingProvider {
  readonly platform = 'discord' as const;
  private readonly config: DiscordConfig;
  private readonly logger: Logger;
  private readonly sessionService: SessionService;
  private client: Client | null = null;
  private messageHandler?: MessageHandlerCallback;
  private started = false;

  constructor(config: DiscordConfig, sessionService: SessionService, logger: Logger) {
    this.config = config;
    this.sessionService = sessionService;
    this.logger = logger.child({ provider: 'discord' });
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
   * Start the Discord bot
   */
  async start(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.info('Discord provider is disabled');
      return;
    }

    if (this.started) {
      this.logger.warn('Discord provider already started');
      return;
    }

    this.logger.info('Starting Discord provider');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel], // Required for DMs
    });

    // Handle ready event
    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info({ username: readyClient.user.tag }, 'Discord bot is ready');
    });

    // Handle messages (mentions and DMs)
    this.client.on(Events.MessageCreate, (message) => this.handleMessage(message));

    // Handle button interactions
    this.client.on(Events.InteractionCreate, (interaction) => this.handleInteraction(interaction));

    // Error handling
    this.client.on(Events.Error, (error) => {
      this.logger.error({ error }, 'Discord client error');
    });

    // Login to Discord
    await this.client.login(this.config.botToken);
    this.started = true;
  }

  /**
   * Stop the Discord bot
   */
  async stop(): Promise<void> {
    if (this.client && this.started) {
      this.logger.info('Stopping Discord provider');
      await this.client.destroy();
      this.started = false;
    }
  }

  /**
   * Send a message to a Discord user
   */
  async sendMessage(userId: PlatformUserId, response: MessageResponse): Promise<void> {
    if (!this.client) {
      this.logger.error('Discord client not initialized');
      return;
    }

    const [, discordUserId] = userId.split(':');
    if (!discordUserId) {
      this.logger.error({ userId }, 'Invalid Discord user ID');
      return;
    }

    try {
      const user = await this.client.users.fetch(discordUserId);
      const session = this.sessionService.getSession(userId);
      const formatted = formatDiscordResponse(response, session.state, session.pendingResults);

      await user.send({
        content: formatted.content,
        embeds: formatted.embeds,
        components: formatted.components,
      });
    } catch (error) {
      this.logger.error({ error, userId }, 'Failed to send Discord message');
    }
  }

  /**
   * Handle incoming Discord messages
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if this is a DM or a mention
    const isDM = !message.guild;
    const isMention = message.mentions.has(this.client!.user!);

    if (!isDM && !isMention) return;

    // Check guild whitelist if configured
    if (message.guild && this.config.allowedGuildIds && this.config.allowedGuildIds.length > 0) {
      if (!this.config.allowedGuildIds.includes(message.guild.id)) {
        this.logger.debug({ guildId: message.guild.id }, 'Message from non-whitelisted guild');
        return;
      }
    }

    // Check channel whitelist if configured
    if (message.channel && this.config.allowedChannelIds && this.config.allowedChannelIds.length > 0) {
      if (!this.config.allowedChannelIds.includes(message.channel.id)) {
        this.logger.debug({ channelId: message.channel.id }, 'Message from non-whitelisted channel');
        return;
      }
    }

    const userId = createPlatformUserId('discord', message.author.id);

    // Remove bot mention from message content
    let content = message.content;
    if (isMention && this.client?.user) {
      content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    }

    if (!content) {
      // If message only contained a mention, treat as help request
      content = 'help';
    }

    this.logger.info({ userId, content }, 'Received Discord message');

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      return;
    }

    try {
      // Show typing indicator (if channel supports it)
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      // Process the message
      const response = await this.messageHandler(userId, content);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatDiscordResponse(response, session.state, session.pendingResults);

      // Reply to the message
      await message.reply({
        content: formatted.content,
        embeds: formatted.embeds,
        components: formatted.components,
      });
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Discord message');
      await message.reply('Something went wrong. Please try again.');
    }
  }

  /**
   * Handle Discord interactions (button clicks)
   */
  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const userId = createPlatformUserId('discord', interaction.user.id);
    const customId = interaction.customId;

    this.logger.info({ userId, customId }, 'Received Discord button interaction');

    // Acknowledge the interaction immediately
    await interaction.deferUpdate();

    // Parse the button ID to determine action
    const { action, value } = parseDiscordButtonId(customId);

    if (!this.messageHandler) {
      this.logger.error('No message handler set');
      return;
    }

    try {
      // Convert button action to text message for handler
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
        default:
          this.logger.warn({ action }, 'Unknown button action');
          return;
      }

      // Process the converted message
      const response = await this.messageHandler(userId, message);

      // Get updated session state for formatting
      const session = this.sessionService.getSession(userId);
      const formatted = formatDiscordResponse(response, session.state, session.pendingResults);

      // Update the original message
      await interaction.editReply({
        content: formatted.content,
        embeds: formatted.embeds,
        components: formatted.components,
      });
    } catch (error) {
      this.logger.error({ error, userId }, 'Error processing Discord interaction');
      await interaction.followUp({
        content: 'Something went wrong. Please try again.',
        ephemeral: true,
      });
    }
  }

  /**
   * Get the Discord client (for advanced use cases)
   */
  getClient(): Client | null {
    return this.client;
  }
}
