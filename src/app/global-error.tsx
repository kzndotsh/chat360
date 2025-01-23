'use client';

import { useEffect } from 'react';

import { logger } from '@/lib/logger';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    logger.error('Global error caught', {
      component: 'GlobalError',
      action: 'handleError',
      metadata: { error },
    });
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Something went wrong!</h2>
            <button
              onClick={() => window.location.reload()}

              className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
