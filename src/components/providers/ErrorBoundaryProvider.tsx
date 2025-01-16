'use client';

import { ReactNode, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { logger } from '@/lib/utils/logger';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const [isClient, setIsClient] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const MAX_RETRIES = 3;
  const INITIAL_ERROR_DELAY = 3000; // Longer initial delay since we know app recovers
  const SHOW_ERROR_DELAY = 2000;

  useEffect(() => {
    setIsClient(true);
    
    // For initial errors, wait longer before showing any UI
    const showTimer = setTimeout(() => {
      // Only show error if we're not in the initial error sequence
      const isInitialError = error.message.includes('500') && retryCount === 0;
      if (!isInitialError) {
        setShowError(true);
      }
    }, retryCount === 0 ? INITIAL_ERROR_DELAY : SHOW_ERROR_DELAY);

    logger.error('Error fallback rendered', {
      component: 'ErrorFallback',
      action: 'render',
      metadata: { 
        error,
        message: error.message,
        stack: error.stack,
        name: error.name,
        isHydrationError: error.message.includes('Hydration'),
        isTransientError: error.message.includes('500') || error.message.includes('CHANNEL_ERROR'),
        retryCount,
        isInitialError: retryCount === 0,
      },
    });

    // Auto-retry for transient errors
    if ((error.message.includes('500') || error.message.includes('CHANNEL_ERROR')) && retryCount < MAX_RETRIES) {
      const retryTimer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        resetErrorBoundary();
      }, retryCount === 0 ? 500 : Math.min(1000 * Math.pow(2, retryCount), 5000)); // Quick first retry, then exponential

      return () => {
        clearTimeout(retryTimer);
        clearTimeout(showTimer);
      };
    }

    return () => clearTimeout(showTimer);
  }, [error, resetErrorBoundary, retryCount]);
  
  if (!isClient || !showError) {
    return null;
  }

  // For transient errors, show a less alarming message
  const isTransientError = error.message.includes('500') || error.message.includes('CHANNEL_ERROR');
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h2 className="mb-4 text-xl">
        {isTransientError ? 'Connecting...' : 'Something went wrong'}
      </h2>
      {(!isTransientError || retryCount >= MAX_RETRIES) && (
        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            resetErrorBoundary();
            window.location.reload();
          }}
          className="rounded bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function ErrorBoundaryProvider({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        logger.error('Root error boundary caught error', {
          component: 'RootLayout',
          action: 'error',
          metadata: { 
            error,
            message: error.message,
            stack: error.stack,
            name: error.name,
            isHydrationError: error.message.includes('Hydration'),
            isTransientError: error.message.includes('500') || error.message.includes('CHANNEL_ERROR'),
          },
        });
      }}
      onReset={() => {
        logger.info('Error boundary reset triggered', {
          component: 'ErrorBoundary',
          action: 'reset',
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
} 