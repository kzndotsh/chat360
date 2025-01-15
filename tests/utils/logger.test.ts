import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/utils/logger';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T06:26:48.440Z'));

    // Mock console methods
    console.info = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    console.debug = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Basic Logging', () => {
    it('should log messages with correct level and format', () => {
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('unknown - unknown: Test message'),
        {}
      );
    });

    it('should handle empty strings', () => {
      logger.info('');
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('No message provided'), {});
    });

    it('should handle undefined metadata', () => {
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Test message'), {});
    });

    it('handles different log levels', () => {
      logger.debug('Debug message');
      expect(console.debug).toHaveBeenCalled();

      logger.info('Info message');
      expect(console.info).toHaveBeenCalled();

      logger.warn('Warn message');
      expect(console.warn).toHaveBeenCalled();

      logger.error('Error message');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Context Logging', () => {
    it('should log with component and action context', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'TestAction',
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('TestComponent - TestAction: Test message'),
        {}
      );
    });

    it('should handle missing component and action', () => {
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('unknown - unknown: Test message'),
        {}
      );
    });

    it('handles very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      logger.info(longMessage, {
        component: 'TestComponent',
        action: 'testAction',
      });
      expect(console.info).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
    });
  });

  describe('Error Handling', () => {
    it('should capture exceptions in Sentry', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { error },
      });
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should add breadcrumbs for non-error logs', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { data: 'test' },
      });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test message',
          level: 'info',
          data: { data: 'test' },
        })
      );
    });

    it('handles Sentry errors gracefully', () => {
      vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error('Sentry error');
      });

      try {
        logger.error('Test message', {
          component: 'TestComponent',
          action: 'testAction',
          metadata: { error: new Error('Test error') },
        });
        // If we reach here, no error was thrown
        expect(console.error).toHaveBeenCalled();
      } catch {
        // Test fails if we reach here
        expect(true).toBe(false);
      }
    });

    it('handles console method errors', () => {
      vi.spyOn(console, 'info').mockImplementationOnce(() => {
        throw new Error('Console error');
      });

      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });
  });

  describe('Circular References', () => {
    it('should handle circular references in metadata', () => {
      interface CircularObject {
        a: number;
        self?: CircularObject;
      }
      const circular: CircularObject = { a: 1 };
      circular.self = circular;

      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { circular },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { circular: { a: 1, self: '[Circular]' } }
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should reset rate limit after window expires', () => {
      // First log
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledTimes(1);

      // Second log immediately after - should be rate limited
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledTimes(1);

      // Advance time by rate limit window
      vi.advanceTimersByTime(1000);

      // Third log after window - should go through
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('API Logging', () => {
    it('should log API requests', () => {
      logger.logAPIRequest('GET', '/api/test', { id: 1 });
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('API - Request: GET /api/test'),
        expect.objectContaining({
          body: { id: 1 },
        })
      );
    });

    it('should log successful API responses', () => {
      logger.logAPIResponse('GET', '/api/test', 200, { data: 'success' }, 100);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('API - Response: GET /api/test - 200'),
        expect.objectContaining({
          status: 200,
          data: { data: 'success' },
          duration: 100,
        })
      );
    });

    it('should log error API responses', () => {
      logger.logAPIResponse('GET', '/api/test', 500, { error: 'server error' });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('API - Response: GET /api/test - 500'),
        expect.objectContaining({
          status: 500,
          data: { error: 'server error' },
        })
      );
    });

    it('handles requests without body', () => {
      logger.logAPIRequest('GET', '/api/test');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('API - Request: GET /api/test'),
        expect.any(Object)
      );
    });

    it('handles responses without data', () => {
      logger.logAPIResponse('GET', '/api/test', 204);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('API - Response: GET /api/test - 204'),
        expect.any(Object)
      );
    });
  });

  describe('Logger > Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T06:26:48.440Z'));
      vi.spyOn(console, 'info');
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('handles null values in metadata', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { nullValue: null },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { nullValue: null }
      );
    });

    it('handles undefined values in metadata', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { undefinedValue: undefined },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { undefinedValue: undefined }
      );
    });

    it('handles functions in metadata', () => {
      const testFn = () => 'test';
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { function: testFn },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { function: '[Function: testFn]' }
      );
    });

    it('handles symbols in metadata', () => {
      const testSymbol = Symbol('test');
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { symbol: testSymbol },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { symbol: 'Symbol(test)' }
      );
    });

    it('handles deeply nested objects', () => {
      const deepObj = {
        level1: {
          level2: {
            level3: {
              value: 'test',
              array: [1, 2, { nested: 'value' }],
            },
          },
        },
      };

      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { deep: deepObj },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { deep: deepObj }
      );
    });

    it('handles arrays with circular references', () => {
      type CircularArray = (number | CircularArray)[];
      const arr: CircularArray = [1, 2, 3];
      arr.push(arr);

      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { array: arr },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[2025-01-15T06:26:48.440Z] TestComponent - testAction: Test message',
        { array: [1, 2, 3, '[Circular ~]'] }
      );
    });
  });

  describe('Performance', () => {
    it('handles high-frequency logging without crashing', () => {
      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        logger.info(`Message ${i}`);
      }

      const end = performance.now();
      const duration = end - start;

      expect(duration).toBeLessThan(1000); // Should process 1000 logs in less than 1 second
    });
  });
});
