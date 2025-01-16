import { useCallback, useRef, useEffect, useState } from 'react';

export function useModalLock() {
  const modalLockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modalLocked, setModalLocked] = useState(false);

  const lockModal = useCallback((duration: number) => {
    setModalLocked(true);
    if (modalLockTimeoutRef.current) {
      clearTimeout(modalLockTimeoutRef.current);
    }
    modalLockTimeoutRef.current = setTimeout(() => {
      setModalLocked(false);
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (modalLockTimeoutRef.current) {
        clearTimeout(modalLockTimeoutRef.current);
      }
    };
  }, []);

  return {
    modalLocked,
    lockModal,
  };
}
