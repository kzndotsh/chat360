import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

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

  const lockModal = (timeout?: number) => {
    setModalLocked(true);
    if (timeout) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setModalLocked(false);
        timeoutRef.current = null;
      }, timeout);
    }
  };

  const unlockModal = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setModalLocked(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ModalLockContext.Provider value={{ modalLocked, lockModal, unlockModal }}>
      {children}
    </ModalLockContext.Provider>
  );
};
