import { useCallback, useRef, useEffect, useState } from 'react';
import { logger } from '@/lib/utils/logger';

export function useModalLock() {
  const modalLockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modalLocked, setModalLocked] = useState(false);

  const lockModal = useCallback((duration: number) => {
    logger.debug('Locking modal', {
      component: 'useModalLock',
      action: 'lock',
      metadata: { duration },
    });

    setModalLocked(true);
    if (modalLockTimeoutRef.current) {
      clearTimeout(modalLockTimeoutRef.current);
      logger.debug('Cleared existing lock timeout', {
        component: 'useModalLock',
        action: 'lock',
      });
    }

    modalLockTimeoutRef.current = setTimeout(() => {
      setModalLocked(false);
      logger.debug('Modal lock expired', {
        component: 'useModalLock',
        action: 'unlock',
        metadata: { duration },
      });
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (modalLockTimeoutRef.current) {
        clearTimeout(modalLockTimeoutRef.current);
        logger.debug('Cleared lock timeout on unmount', {
          component: 'useModalLock',
          action: 'cleanup',
        });
      }
    };
  }, []);

  return {
    modalLocked,
    lockModal,
  };
}
