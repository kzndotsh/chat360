import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/utils/logger';

export function useCurrentTime() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const mountedRef = useRef(true);

  useEffect(() => {
    logger.debug('Starting time update interval', {
      component: 'useCurrentTime',
      action: 'initialize',
    });

    const timer = setInterval(() => {
      if (!mountedRef.current) return;

      const newTime = new Date();
      setCurrentTime(newTime);

      // Log if time seems invalid
      if (isNaN(newTime.getTime())) {
        logger.warn('Invalid time value detected', {
          component: 'useCurrentTime',
          action: 'update',
          metadata: {
            currentTimeISOString: newTime.toISOString(),
            timestamp: Date.now(),
          },
        });
      }
    }, 1000);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      logger.debug('Cleaned up time update interval', {
        component: 'useCurrentTime',
        action: 'cleanup',
      });
    };
  }, []);

  return currentTime;
}
