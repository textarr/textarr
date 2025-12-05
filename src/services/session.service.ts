import type { Logger } from '../utils/logger.js';
import type { MediaSearchResult, ConversationState, SessionData, Platform } from '../schemas/index.js';
import type { PlatformUserId } from '../messaging/types.js';
import { parsePlatformUserId } from '../messaging/types.js';

/**
 * Session manager for tracking conversation state per user
 */
export class SessionService {
  private readonly sessions: Map<string, SessionData> = new Map();
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(timeoutMs: number, logger: Logger, cleanupIntervalMs = 60000) {
    this.timeoutMs = timeoutMs;
    this.logger = logger.child({ service: 'session' });

    // Clean up expired sessions periodically
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), cleanupIntervalMs);
  }

  /**
   * Get or create a session for a user
   */
  getSession(userId: PlatformUserId): SessionData {
    let session = this.sessions.get(userId);

    if (!session || this.isExpired(session)) {
      session = this.createSession(userId);
      this.sessions.set(userId, session);
      this.logger.debug({ userId }, 'Created new session');
    } else {
      // Update last activity
      session.lastActivity = new Date();
    }

    return session;
  }

  /**
   * Update session state
   */
  setState(userId: PlatformUserId, state: ConversationState): void {
    const session = this.getSession(userId);
    session.state = state;
    session.lastActivity = new Date();
    this.logger.debug({ userId, state }, 'Updated session state');
  }

  /**
   * Atomically update session state with context
   * Prevents race condition where session could expire between separate calls
   */
  setStateWithContext(userId: PlatformUserId, state: ConversationState, context: Record<string, unknown>): void {
    const session = this.getSession(userId);
    session.state = state;
    session.context = { ...session.context, ...context };
    session.lastActivity = new Date();
    this.logger.debug({ userId, state, context }, 'Updated session state with context');
  }

  /**
   * Set pending results for selection
   */
  setPendingResults(userId: PlatformUserId, results: MediaSearchResult[]): void {
    const session = this.getSession(userId);
    session.pendingResults = results;
    session.state = 'awaiting_selection';
    session.lastActivity = new Date();
    this.logger.debug({ userId, resultCount: results.length }, 'Set pending results');
  }

  /**
   * Set selected media for confirmation
   */
  setSelectedMedia(userId: PlatformUserId, media: MediaSearchResult): void {
    const session = this.getSession(userId);
    session.selectedMedia = media;
    session.state = 'awaiting_confirmation';
    session.lastActivity = new Date();
    this.logger.debug({ userId, title: media.title }, 'Set selected media');
  }

  /**
   * Get pending results
   */
  getPendingResults(userId: PlatformUserId): MediaSearchResult[] {
    return this.getSession(userId).pendingResults;
  }

  /**
   * Get selected media
   */
  getSelectedMedia(userId: PlatformUserId): MediaSearchResult | null {
    return this.getSession(userId).selectedMedia;
  }

  /**
   * Reset session to idle state
   */
  resetSession(userId: PlatformUserId): void {
    const session = this.getSession(userId);
    session.state = 'idle';
    session.pendingResults = [];
    session.selectedMedia = null;
    session.lastActivity = new Date();
    this.logger.debug({ userId }, 'Reset session');
  }

  /**
   * Delete a session
   */
  deleteSession(userId: PlatformUserId): void {
    this.sessions.delete(userId);
    this.logger.debug({ userId }, 'Deleted session');
  }

  /**
   * Create a new session
   */
  private createSession(userId: PlatformUserId): SessionData {
    const { platform } = parsePlatformUserId(userId);
    return {
      userId,
      platform: platform as Platform,
      state: 'idle',
      pendingResults: [],
      selectedMedia: null,
      lastActivity: new Date(),
      context: {},
    };
  }

  /**
   * Check if a session has expired
   */
  private isExpired(session: SessionData): boolean {
    const elapsed = Date.now() - session.lastActivity.getTime();
    return elapsed > this.timeoutMs;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpired(): void {
    let cleaned = 0;
    for (const [userId, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug({ cleaned }, 'Cleaned up expired sessions');
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
