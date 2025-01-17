'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { logger } from '@/lib/utils/logger';

interface ModalPortalProps {
  children: React.ReactNode;
}

export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const loggerRef = useRef(logger);
  const mountedRef = useRef(false);

  useEffect(() => {
    const logger = loggerRef.current;
    logger.debug('Modal portal mounting', {
      component: 'ModalPortal',
      action: 'mount',
      metadata: {
        portalTarget: 'body',
        hasChildren: !!children,
      },
    });

    setMounted(true);

    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      logger.debug('Modal portal unmounting', {
        component: 'ModalPortal',
        action: 'unmount',
      });
    };
  }, [children]);

  if (!mounted) {
    loggerRef.current.debug('Modal portal render skipped - not mounted', {
      component: 'ModalPortal',
      action: 'render',
      metadata: { mounted },
    });
    return null;
  }

  return createPortal(children, document.body);
};
