'use client';

import React from 'react';

interface BaseModalProps {
  children: React.ReactNode;
  preventOutsideClick?: boolean;
  onCloseAction: () => void;
}

export function BaseModal({
  children,
  onCloseAction,
  preventOutsideClick = false,
}: BaseModalProps) {
  const [isClosing, setIsClosing] = React.useState<boolean>(false);
  const [isAnimating, setIsAnimating] = React.useState<boolean>(false);
  const mounted = React.useRef(true);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const handleClose = React.useCallback(() => {
    if (!preventOutsideClick && mounted.current && !isAnimating) {
      setIsAnimating(true);
      setIsClosing(true);
      closeTimer.current = setTimeout(() => {
        if (mounted.current) {
          setIsAnimating(false);
          onCloseAction();
        }
      }, 200);
    }
  }, [preventOutsideClick, onCloseAction, isAnimating]);

  const overlayStyles = React.useMemo(() => {
    return `absolute inset-0 bg-black/50 transition-opacity duration-200 ${
      isClosing ? 'opacity-0' : 'opacity-100'
    }`;
  }, [isClosing]);

  const contentStyles = React.useMemo(() => {
    return `relative z-50 transition-all duration-200 ${
      isClosing
        ? 'opacity-0 scale-95 translate-y-5'
        : 'opacity-100 scale-100 translate-y-0'
    }`;
  }, [isClosing]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
    >
      <div
        onClick={handleClose}

        className={overlayStyles}
        role="presentation"
      />
      <div className={contentStyles}>
        {children}
      </div>
    </div>
  );
}
