import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { logger } from '@/lib/utils/logger';

interface ModalLockContextType {
  modalLocked: boolean;
  lockModal: (timeout?: number) => void;
  unlockModal: () => void;
}

const ModalLockContext = createContext<ModalLockContextType>({
  modalLocked: false,
  lockModal: () => {},
  unlockModal: () => {},
});

export const useModalLock = () => useContext(ModalLockContext);

export const ModalLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalLocked, setModalLocked] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const lockModal = (timeout?: number) => {
    logger.debug('Locking modal', {
      component: 'ModalLockContext',
      action: 'lock',
      metadata: { timeout },
    });

    setModalLocked(true);
    if (timeout) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        logger.debug('Cleared existing lock timeout', {
          component: 'ModalLockContext',
          action: 'lock',
        });
      }
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;

        setModalLocked(false);
        timeoutRef.current = null;
        logger.debug('Modal lock expired', {
          component: 'ModalLockContext',
          action: 'unlock',
          metadata: { timeout },
        });
      }, timeout);
    }
  };

  const unlockModal = () => {
    logger.debug('Manually unlocking modal', {
      component: 'ModalLockContext',
      action: 'unlock',
      metadata: {
        hadTimeout: !!timeoutRef.current,
      },
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setModalLocked(false);
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        logger.debug('Cleared lock timeout on unmount', {
          component: 'ModalLockContext',
          action: 'cleanup',
        });
      }
    };
  }, []);

  return (
    <ModalLockContext.Provider value={{ modalLocked, lockModal, unlockModal }}>
      {children}
    </ModalLockContext.Provider>
  );
};
