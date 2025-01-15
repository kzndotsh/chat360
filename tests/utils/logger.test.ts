import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/utils/logger';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn()
}));

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log');
    vi.spyOn(console, 'info');
    vi.spyOn(console, 'warn');
    vi.spyOn(console, 'error');
    vi.spyOn(console, 'debug');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('No message provided'),
        {}
      );
    });

    it('should handle undefined metadata', () => {
      logger.info('Test message');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message'),
        {}
      );
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
        action: 'TestAction'
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
        action: 'testAction'
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should capture exceptions in Sentry', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { error }
      });
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should add breadcrumbs for non-error logs', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { data: 'test' }
      });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test message',
          level: 'info',
          data: { data: 'test' }
        })
      );
    });

    it('handles Sentry errors gracefully', () => {
      vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error('Sentry error');
      });

      expect(() => {
        logger.error('Test message', {
          component: 'TestComponent',
          action: 'testAction',
          metadata: { error: new Error('Test error') }
        });
      }).not.toThrow();

      expect(console.error).toHaveBeenCalled();
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
      const circularObj: Record<string, unknown> = { a: 1 };
      circularObj.self = circularObj;
      
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { circular: circularObj }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          circular: expect.objectContaining({
            a: 1,
            self: '[Circular]'
          })
        })
      );
    });

    it('handles nested circular references', () => {
      const obj1: Record<string, unknown> = { a: 1 };
      const obj2: Record<string, unknown> = { b: 2 };
      obj1.ref = obj2;
      obj2.ref = obj1;

      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { nested: obj1 }
      });
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive logs', () => {
      // Generate 150 logs in quick succession
      for (let i = 0; i < 150; i++) {
        logger.info(`Message ${i}`);
      }

      // Should have logged warning about rate limit
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );

      // Should have logged first 100 messages
      expect(console.info).toHaveBeenCalledTimes(100);
    });

    it('should reset rate limit after window expires', () => {
      // Generate 50 logs
      for (let i = 0; i < 50; i++) {
        logger.info(`Message ${i}`);
      }

      // Advance time by rate limit window
      vi.advanceTimersByTime(1000);

      // Generate 50 more logs
      for (let i = 50; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      // Should have logged all messages
      expect(console.info).toHaveBeenCalledTimes(100);
    });
  });

  describe('API Logging', () => {
    it('should log API requests', () => {
      logger.logAPIRequest('GET', '/api/test', { id: 1 });
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('API - Request: GET /api/test'),
        expect.objectContaining({
          body: { id: 1 }
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
          duration: 100
        })
      );
    });

    it('should log error API responses', () => {
      logger.logAPIResponse('GET', '/api/test', 500, { error: 'server error' });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('API - Response: GET /api/test - 500'),
        expect.objectContaining({
          status: 500,
          data: { error: 'server error' }
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

  describe('Edge Cases', () => {
    it('handles null values in metadata', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { nullValue: null }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          nullValue: null
        })
      );
    });

    it('handles undefined values in metadata', () => {
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { undefinedValue: undefined }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          undefinedValue: undefined
        })
      );
    });

    it('handles functions in metadata', () => {
      const testFn = () => 'test';
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { function: testFn }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          function: '[Function: testFn]'
        })
      );
    });

    it('handles symbols in metadata', () => {
      const testSymbol = Symbol('test');
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { symbol: testSymbol }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          symbol: 'Symbol(test)'
        })
      );
    });

    it('handles deeply nested objects', () => {
      const deepObj = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'test'
              }
            }
          }
        }
      };
      
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { deep: deepObj }
      });
      expect(console.info).toHaveBeenCalled();
    });

    it('handles arrays with circular references', () => {
      const arr: unknown[] = [1, 2, 3];
      arr.push(arr);
      
      logger.info('Test message', {
        component: 'TestComponent',
        action: 'testAction',
        metadata: { array: arr }
      });
      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          array: expect.arrayContaining([1, 2, 3, '[Circular]'])
        })
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