import { describe, it, expect } from 'vitest';
import { formatMessage, getStateLabel, type StateLabelMessages } from '../../src/utils/messages.js';

// Mock messages for testing
const mockMessages: StateLabelMessages = {
  labelIdle: 'Ready for requests',
  labelAwaitingSelection: 'Waiting for selection',
  labelAwaitingConfirmation: 'Waiting for confirmation',
  labelAwaitingAnimeConfirmation: 'Waiting for anime confirmation',
  labelAwaitingSeasonSelection: 'Waiting for season selection',
};

describe('messages utilities', () => {
  describe('formatMessage', () => {
    it('should replace single placeholder', () => {
      const result = formatMessage('Hello {userName}!', { userName: 'John' });
      expect(result).toBe('Hello John!');
    });

    it('should replace multiple placeholders', () => {
      const result = formatMessage('Found {count} results for "{query}":', {
        count: 5,
        query: 'Breaking Bad',
      });
      expect(result).toBe('Found 5 results for "Breaking Bad":');
    });

    it('should keep placeholder when value not provided', () => {
      const result = formatMessage('Hello {userName}!', {});
      expect(result).toBe('Hello {userName}!');
    });

    it('should handle empty vars object', () => {
      const result = formatMessage('No placeholders here');
      expect(result).toBe('No placeholders here');
    });

    it('should handle numeric values', () => {
      const result = formatMessage('{title} ({year}) - Rating: {rating}', {
        title: 'Inception',
        year: 2010,
        rating: 8.8,
      });
      expect(result).toBe('Inception (2010) - Rating: 8.8');
    });

    it('should not replace partial placeholders', () => {
      const result = formatMessage('Hello {userName and {another}', { userName: 'Test' });
      expect(result).toBe('Hello {userName and {another}');
    });

    it('should handle same placeholder multiple times', () => {
      const result = formatMessage('{name} is {name}', { name: 'Bob' });
      expect(result).toBe('Bob is Bob');
    });

    it('should handle special characters in values', () => {
      const result = formatMessage('Query: "{query}"', { query: 'test & <script>alert(1)</script>' });
      expect(result).toBe('Query: "test & <script>alert(1)</script>"');
    });

    it('should handle undefined and null values by keeping placeholder', () => {
      const result = formatMessage('{defined} and {undefined}', {
        defined: 'value',
        undefined: undefined,
      });
      expect(result).toBe('value and {undefined}');
    });

    it('should handle zero as a valid value', () => {
      const result = formatMessage('Count: {count}', { count: 0 });
      expect(result).toBe('Count: 0');
    });

    it('should handle complex template', () => {
      const result = formatMessage(
        '{emoji} {title}{year} - {mediaType}\n{overview}',
        {
          emoji: '🎬',
          title: 'Dune',
          year: ' (2021)',
          mediaType: 'Movie',
          overview: 'A sci-fi epic.',
        }
      );
      expect(result).toBe('🎬 Dune (2021) - Movie\nA sci-fi epic.');
    });
  });

  describe('getStateLabel', () => {
    it('should return label for idle state', () => {
      expect(getStateLabel('idle', mockMessages)).toBe('Ready for requests');
    });

    it('should return label for awaiting_selection state', () => {
      expect(getStateLabel('awaiting_selection', mockMessages)).toBe('Waiting for selection');
    });

    it('should return label for awaiting_confirmation state', () => {
      expect(getStateLabel('awaiting_confirmation', mockMessages)).toBe('Waiting for confirmation');
    });

    it('should return label for awaiting_anime_confirmation state', () => {
      expect(getStateLabel('awaiting_anime_confirmation', mockMessages)).toBe('Waiting for anime confirmation');
    });

    it('should return label for awaiting_season_selection state', () => {
      expect(getStateLabel('awaiting_season_selection', mockMessages)).toBe('Waiting for season selection');
    });

    it('should return raw state for unknown state', () => {
      expect(getStateLabel('unknown_state', mockMessages)).toBe('unknown_state');
    });

    it('should return empty string for empty string', () => {
      expect(getStateLabel('', mockMessages)).toBe('');
    });
  });
});
