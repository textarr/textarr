import type { Logger } from '../utils/logger.js';
import { MediaServiceError } from '../utils/errors.js';
import type { MediaSearchResult } from '../schemas/index.js';

/**
 * Base configuration for media services
 */
export interface BaseMediaConfig {
  url: string;
  apiKey: string;
  qualityProfileId: number;
  rootFolder: string;
}

/**
 * Queue item returned by getQueue
 */
export interface QueueItem {
  title: string;
  status: string;
  progress: number;
  timeLeft?: string;
}

/**
 * Queue response structure from *arr APIs
 */
interface QueueResponse {
  records: Array<{
    title: string;
    status: string;
    sizeleft: number;
    size: number;
    timeleft?: string;
  }>;
}

/**
 * Abstract base class for media services (Sonarr/Radarr)
 * Provides common HTTP request handling and shared endpoints
 */
export abstract class BaseMediaService {
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly qualityProfileId: number;
  protected readonly rootFolder: string;
  protected readonly logger: Logger;

  /** Service name for logging and errors */
  protected abstract readonly serviceName: 'sonarr' | 'radarr';

  constructor(config: BaseMediaConfig, logger: Logger, serviceName: string) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.qualityProfileId = config.qualityProfileId;
    this.rootFolder = config.rootFolder;
    this.logger = logger.child({ service: serviceName });
  }

  protected get headers(): Record<string, string> {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  protected apiUrl(endpoint: string): string {
    return `${this.baseUrl}/api/v3/${endpoint.replace(/^\//, '')}`;
  }

  /**
   * Make an API request to the media service with timeout
   */
  protected async request<T>(
    method: string,
    endpoint: string,
    options?: { params?: Record<string, string>; body?: unknown }
  ): Promise<T> {
    const url = new URL(this.apiUrl(endpoint));

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    this.logger.debug({ method, url: url.toString() }, `Making ${this.serviceName} request`);

    // Add 10 second timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this.headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        this.logger.error({ status: response.status, error: errorText }, `${this.serviceName} request failed`);
        throw new MediaServiceError(this.serviceName, `Request failed: ${response.statusText}`, response.status);
      }

      const text = await response.text();
      return text ? (JSON.parse(text) as T) : (null as T);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error({ url: url.toString() }, `${this.serviceName} request timed out after 10s`);
        throw new MediaServiceError(this.serviceName, 'Request timed out', 408);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Test connection to the service
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request<unknown>('GET', 'system/status');
      this.logger.info(`${this.serviceName} connection successful`);
      return true;
    } catch (error) {
      this.logger.error({ error }, `${this.serviceName} connection failed`);
      return false;
    }
  }

  /**
   * Get download queue
   */
  async getQueue(): Promise<QueueItem[]> {
    const response = await this.request<QueueResponse>('GET', 'queue', {
      params: { pageSize: '100' },
    });

    return (response.records || []).map((item) => ({
      title: item.title,
      status: item.status,
      progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
      timeLeft: item.timeleft,
    }));
  }

  /**
   * Get quality profiles
   */
  async getQualityProfiles(): Promise<Array<{ id: number; name: string }>> {
    return this.request<Array<{ id: number; name: string }>>('GET', 'qualityprofile');
  }

  /**
   * Get root folders
   */
  async getRootFolders(): Promise<Array<{ id: number; path: string }>> {
    return this.request<Array<{ id: number; path: string }>>('GET', 'rootfolder');
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<Array<{ id: number; label: string }>> {
    return this.request<Array<{ id: number; label: string }>>('GET', 'tag');
  }

  /**
   * Search for media by term - implemented by subclasses
   */
  abstract search(term: string): Promise<MediaSearchResult[]>;
}
