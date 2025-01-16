'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/utils/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Server-side error caught', {
      component: 'Error',
      action: 'error',
      metadata: { error, digest: error.digest },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h2 className="mb-4 text-xl">Something went wrong</h2>
      <button
        onClick={() => {
          logger.info('Attempting to reset after server error', {
            component: 'Error',
            action: 'reset',
          });
          reset();
        }}
        className="rounded bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200"
      >
        Try again
      </button>
    </div>
  );
} 