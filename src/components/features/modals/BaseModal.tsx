'use client';

import React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

interface BaseModalProps {
  children: React.ReactNode;
  preventOutsideClick?: boolean;
  onCloseAction: () => void;
}

export function BaseModal({ children, onCloseAction, preventOutsideClick = false }: BaseModalProps) {
  return (
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          onClick={preventOutsideClick ? undefined : onCloseAction}

          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/50"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative z-50"
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
