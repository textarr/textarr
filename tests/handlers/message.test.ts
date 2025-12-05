import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../../src/handlers/message.handler.js';
import type { Services } from '../../src/services/index.js';
import type { Config } from '../../src/config/index.js';
import type { MediaSearchResult } from '../../src/schemas/index.js';
import type { PlatformUserId } from '../../src/messaging/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockServices: Services;
  let mockConfig: Config;

  const testUserId: PlatformUserId = 'sms:+1234567890';

  const createMockMedia = (overrides: Partial<MediaSearchResult> = {}): MediaSearchResult => ({
    id: 1,
    title: 'Test Title',
    year: 2020,
    overview: 'Test overview',
    posterUrl: null,
    mediaType: 'movie',
    status: 'released',
    inLibrary: false,
    seasonCount: null,
    runtime: 120,
    rating: 8.0,
    rawData: {},
    ...overrides,
  });

  beforeEach(() => {
    mockServices = {
      sonarr: {
        search: vi.fn().mockResolvedValue([]),
        addSeries: vi.fn().mockResolvedValue({}),
        getQueue: vi.fn().mockResolvedValue([]),
        testConnection: vi.fn().mockResolvedValue(true),
      },
      radarr: {
        search: vi.fn().mockResolvedValue([]),
        addMovie: vi.fn().mockResolvedValue({}),
        getQueue: vi.fn().mockResolvedValue([]),
        testConnection: vi.fn().mockResolvedValue(true),
        getAllMovies: vi.fn().mockResolvedValue([]),
      },
      ai: {
        parseMessage: vi.fn(),
      },
      session: {
        getSession: vi.fn().mockReturnValue({
          userId: testUserId,
          platform: 'sms',
          state: 'idle',
          pendingResults: [],
          selectedMedia: null,
          lastActivity: new Date(),
          context: {},
        }),
        setState: vi.fn(),
        setPendingResults: vi.fn(),
        setSelectedMedia: vi.fn(),
        getPendingResults: vi.fn().mockReturnValue([]),
        getSelectedMedia: vi.fn().mockReturnValue(null),
        resetSession: vi.fn(),
      },
      twilio: {
        sendMessage: vi.fn().mockResolvedValue('SM123'),
        generateTwiML: vi.fn((msg: string) => `<Response><Message>${msg}</Message></Response>`),
      },
      tmdb: {
        searchMulti: vi.fn().mockResolvedValue([]),
        getTvdbId: vi.fn().mockResolvedValue(12345),
        detectAnime: vi.fn().mockResolvedValue('regular'),
      },
      user: {
        isAuthorized: vi.fn().mockReturnValue(true),
        getUser: vi.fn().mockReturnValue({
          id: 'test-uuid',
          name: 'Test User',
          isAdmin: false,
          identities: { sms: '+1234567890' },
        }),
        isAdmin: vi.fn().mockReturnValue(false),
        getAllUsers: vi.fn().mockReturnValue([]),
        getAdmins: vi.fn().mockReturnValue([]),
        checkQuota: vi.fn().mockReturnValue({ allowed: true, current: 0, limit: 10, resetDate: new Date() }),
        incrementRequestCount: vi.fn(),
      },
      mediaRequest: {
        recordRequest: vi.fn(),
      },
    } as unknown as Services;

    mockConfig = {
      server: { port: 3030, nodeEnv: 'test', logLevel: 'silent', isDev: false, isProd: false, externalUrl: '' },
      ai: { provider: 'openai', model: 'gpt-4', openaiApiKey: 'test' },
      twilio: { enabled: true, accountSid: 'AC123', authToken: 'test', phoneNumber: '+15555555555', sendPosterImages: false },
      telegram: { enabled: false, botToken: '', allowedChatIds: [], usePolling: true, respondToUnregistered: true },
      discord: { enabled: false, botToken: '', allowedGuildIds: [], allowedChannelIds: [], respondToUnregistered: true },
      slack: { enabled: false, botToken: '', signingSecret: '', appToken: '', useSocketMode: false, respondToUnregistered: true },
      sonarr: {
        url: 'http://localhost:8989',
        apiKey: 'test',
        qualityProfileId: 1,
        rootFolder: '/tv',
        animeRootFolder: '/anime/tv',
        animeQualityProfileId: 2,
        animeTagIds: [1],
      },
      radarr: {
        url: 'http://localhost:7878',
        apiKey: 'test',
        qualityProfileId: 1,
        rootFolder: '/movies',
        animeRootFolder: '/anime/movies',
        animeQualityProfileId: 2,
        animeTagIds: [1],
      },
      tmdb: { apiKey: 'test', language: 'en' },
      users: [{
        id: 'test-uuid',
        name: 'Test User',
        isAdmin: false,
        createdAt: new Date().toISOString(),
        identities: { sms: '+1234567890' },
        requestCount: { movies: 0, tvShows: 0, lastReset: new Date().toISOString() },
        notificationPreferences: { enabled: true },
      }],
      quotas: { enabled: false, period: 'weekly', movieLimit: 10, tvShowLimit: 10, adminExempt: true },
      session: { timeoutMs: 300000, maxSearchResults: 5, unregisteredMessage: "You're not registered." },
      notifications: { enabled: false, platforms: ['sms'] },
      downloadNotifications: { enabled: false, webhookSecret: '', messageTemplate: '' },
      messages: {
        acknowledgment: 'One second...',
        genericError: 'Something went wrong. Please try again.',
        notConfigured: 'Service not configured.',
        cancelled: 'Cancelled. Send a new request anytime!',
        restart: 'Starting fresh! What would you like to add?',
        backToStart: 'Back to the start! What would you like to add?',
        addPrompt: "What would you like to add? Try: 'Add Breaking Bad' or 'Add Dune'",
        unknownCommand: "I didn't understand that. Try: 'Add Breaking Bad' or 'help' for commands.",
        nothingToConfirm: 'Nothing to confirm.',
        nothingToSelect: 'Nothing to select from.',
        noPreviousResults: 'No previous results to choose from.',
        nothingSelected: 'Nothing selected.',
        selectRange: 'Please select a number between 1 and {max}.',
        noResults: 'No results found for "{query}".',
        searchResults: 'Found {count} results for "{query}":',
        selectPrompt: 'Reply with a number, or search for something else.',
        confirmPrompt: 'YES to add, NO to cancel, or pick a different number.',
        confirmAnimePrompt: 'YES to add to anime library, NO to cancel.',
        animeOrRegularPrompt: 'This appears to be animated content.\n\nReply ANIME or REGULAR.',
        seasonSelectPrompt: 'Which seasons?\n1. All\n2. First season\n3. Latest season\n4. Future only',
        seasonConfirmPrompt: 'Monitoring: {monitorType}\n\nYES to add, NO to cancel.',
        mediaAdded: '{title} added!',
        alreadyAvailable: '{title} is available to watch!',
        alreadyMonitored: '{title} is in your library, waiting to download.',
        alreadyPartial: '{title} is partially available.',
        alreadyWaitingRelease: '{title} is in your library, waiting for release.',
        alreadyWaitingEpisodes: '{title} is in your library, waiting for episodes.',
        alreadyInLibrary: '{title} is already in your library!',
        nothingDownloading: 'Nothing is currently downloading.',
        currentlyDownloading: 'Currently downloading:',
        adminOnly: 'This command is only available to admins.',
        noUsers: 'No users configured.',
        adminNotification: 'New Request\n{userName} added:\n{title}',
        quotaExceeded: 'Request limit reached\n\n{quotaMessage}',
        tvdbNotFound: 'Could not find "{title}" in TVDB.',
        failedToAdd: 'Failed to add {title}. Please try again.',
        labelIdle: 'Ready for a new request',
        labelAwaitingSelection: 'Waiting for you to pick from search results',
        labelAwaitingConfirmation: 'Waiting for you to confirm',
        labelAwaitingAnimeConfirmation: 'Waiting for anime/regular choice',
        labelAwaitingSeasonSelection: 'Waiting for season selection',
        helpText: `Textarr Help

Commands:
• "Add [title]" - Add a movie or TV show
• "Add [title] anime" - Add anime content
• "Status" - Check download progress
• "Help" - Show this message`,
        adminHelpText: `Admin Commands:
• "admin list" - List all users`,
      },
    } as Config;

    handler = new MessageHandler(mockServices, mockConfig, logger);
  });

  describe('help command', () => {
    it('should return help message', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'help',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'help',
      });

      const response = await handler.handleMessage(testUserId, 'help');

      expect(response.text).toContain('Textarr Help');
      expect(response.text).toContain('Add [title]');
    });
  });

  describe('status command', () => {
    it('should return empty queue message', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'status',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'status',
      });

      const response = await handler.handleMessage(testUserId, 'status');

      expect(response.text).toContain('Nothing is currently downloading');
    });

    it('should return queue items', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'status',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'status',
      });

      vi.mocked(mockServices.sonarr.getQueue).mockResolvedValue([
        { title: 'Show S01E01', status: 'downloading', progress: 50, timeLeft: '10:00' },
      ]);

      const response = await handler.handleMessage(testUserId, 'status');

      expect(response.text).toContain('Currently downloading');
      expect(response.text).toContain('Show S01E01');
      expect(response.text).toContain('50%');
    });
  });

  describe('add command', () => {
    it('should prompt for title if missing', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'movie',
        title: null,
        year: null,
        action: 'add',
        selectionNumber: null,
        confidence: 0.5,
        rawMessage: 'add',
      });

      const response = await handler.handleMessage(testUserId, 'add');

      expect(response.text).toContain('What would you like to add?');
    });

    it('should return no results message', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'movie',
        title: 'Nonexistent Movie',
        year: null,
        action: 'add',
        selectionNumber: null,
        confidence: 0.9,
        rawMessage: 'add nonexistent movie',
      });

      vi.mocked(mockServices.radarr.search).mockResolvedValue([]);

      const response = await handler.handleMessage(testUserId, 'add nonexistent movie');

      expect(response.text).toContain('No results found');
    });

    it('should ask for confirmation with single result', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'movie',
        title: 'Inception',
        year: null,
        action: 'add',
        selectionNumber: null,
        confidence: 0.9,
        rawMessage: 'add inception',
      });

      vi.mocked(mockServices.tmdb.searchMulti).mockResolvedValue([
        createMockMedia({ title: 'Inception', year: 2010 }),
      ]);

      const response = await handler.handleMessage(testUserId, 'add inception');

      expect(response.text).toContain('Inception');
      expect(response.text).toContain('2010');
      expect(response.text).toContain('YES to add');
      expect(mockServices.session.setSelectedMedia).toHaveBeenCalled();
    });

    it('should show selection list with multiple results', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'movie',
        title: 'Dune',
        year: null,
        action: 'add',
        selectionNumber: null,
        confidence: 0.9,
        rawMessage: 'add dune',
      });

      vi.mocked(mockServices.tmdb.searchMulti).mockResolvedValue([
        createMockMedia({ title: 'Dune', year: 2021 }),
        createMockMedia({ id: 2, title: 'Dune', year: 1984 }),
      ]);

      const response = await handler.handleMessage(testUserId, 'add dune');

      expect(response.text).toContain('Found 2 results');
      expect(response.text).toContain('1.');
      expect(response.text).toContain('2.');
      expect(response.text).toContain('Reply with a number');
      expect(mockServices.session.setPendingResults).toHaveBeenCalled();
    });
  });

  describe('cancel command', () => {
    it('should reset session and return cancelled message', async () => {
      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'cancel',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'no',
      });

      const response = await handler.handleMessage(testUserId, 'no');

      expect(response.text).toContain('Cancelled');
      expect(mockServices.session.resetSession).toHaveBeenCalled();
    });
  });

  describe('confirm command', () => {
    it('should add movie when confirmed', async () => {
      const selectedMedia = createMockMedia({ title: 'Inception', year: 2010 });

      vi.mocked(mockServices.session.getSession).mockReturnValue({
        userId: testUserId,
        platform: 'sms',
        state: 'awaiting_confirmation',
        pendingResults: [],
        selectedMedia,
        lastActivity: new Date(),
        context: {},
      });

      vi.mocked(mockServices.session.getSelectedMedia).mockReturnValue(selectedMedia);

      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'confirm',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'yes',
      });

      const response = await handler.handleMessage(testUserId, 'yes');

      expect(response.text).toContain('Inception');
      expect(response.text).toContain('added');
      expect(mockServices.radarr.addMovie).toHaveBeenCalledWith(selectedMedia, {});
    });
  });

  describe('anime confirmation', () => {
    it('should add anime movie with anime config when anime confirmed', async () => {
      const selectedMedia = createMockMedia({
        title: 'Spirited Away',
        year: 2001,
        animeStatus: 'uncertain',
      });

      vi.mocked(mockServices.session.getSession).mockReturnValue({
        userId: testUserId,
        platform: 'sms',
        state: 'awaiting_anime_confirmation',
        pendingResults: [],
        selectedMedia,
        lastActivity: new Date(),
        context: {},
      });

      vi.mocked(mockServices.session.getSelectedMedia).mockReturnValue(selectedMedia);

      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'anime_confirm',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'anime',
      });

      const response = await handler.handleMessage(testUserId, 'anime');

      expect(response.text).toContain('Spirited Away');
      expect(response.text).toContain('(anime) added!');
      expect(mockServices.radarr.addMovie).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Spirited Away', animeStatus: 'anime' }),
        expect.objectContaining({
          rootFolder: '/anime/movies',
          qualityProfileId: 2,
          tags: [1],
        })
      );
    });

    it('should add as regular when regular confirmed', async () => {
      const selectedMedia = createMockMedia({
        title: 'Castlevania',
        mediaType: 'tv_show',
        animeStatus: 'uncertain',
      });

      vi.mocked(mockServices.session.getSession).mockReturnValue({
        userId: testUserId,
        platform: 'sms',
        state: 'awaiting_anime_confirmation',
        pendingResults: [],
        selectedMedia,
        lastActivity: new Date(),
        context: {},
      });

      vi.mocked(mockServices.session.getSelectedMedia).mockReturnValue(selectedMedia);

      vi.mocked(mockServices.ai.parseMessage).mockResolvedValue({
        mediaType: 'unknown',
        title: null,
        year: null,
        action: 'regular_confirm',
        selectionNumber: null,
        confidence: 1.0,
        rawMessage: 'regular',
      });

      const response = await handler.handleMessage(testUserId, 'regular');

      expect(response.text).toContain('Castlevania');
      expect(response.text).toContain('added');
      expect(mockServices.sonarr.addSeries).toHaveBeenCalledWith(
        expect.objectContaining({ animeStatus: 'regular' }),
        expect.objectContaining({ monitor: 'all' })
      );
    });
  });
});
