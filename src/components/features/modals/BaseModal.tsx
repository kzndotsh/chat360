'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BaseModalProps {
  children: React.ReactNode;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function BaseModal({ children, onClose, isSubmitting }: BaseModalProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  const handleClose = React.useCallback(() => {
    if (isSubmitting) return;
    setIsOpen(false);
    onClose();
  }, [isSubmitting, onClose]);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleClose, isSubmitting]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative z-50"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
