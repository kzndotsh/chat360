'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

import { XboxIntro } from '@/components/features/party/XboxIntro';
import { RoomSkeleton } from '@/components/features/party/RoomSkeleton';
import { logger } from '@/lib/utils/logger';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  useEffect(() => {
    logger.error('Page error boundary caught error', {
      component: 'Page',
      action: 'error',
      metadata: { error },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h2 className="mb-4 text-xl">Something went wrong</h2>
      <button
        onClick={resetErrorBoundary}
        className="rounded bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200"
      >
        Try again
      </button>
    </div>
  );
}

const PartyChat = dynamic(
  () =>
    import('@/components/features/party/PartyChat')
      .then((mod) => mod.PartyChat)
      .catch((err) => {
        logger.error(`Error loading PartyChat: ${err.message}`);
        const FallbackComponent = () => <div>Failed to load chat component</div>;
        FallbackComponent.displayName = 'FallbackComponent';
        return FallbackComponent;
      }),
  {
    ssr: false,
    loading: () => {
      logger.info('Loading PartyChat component...');
      return <RoomSkeleton />;
    },
  }
);

export default function Page() {
  const [showIntro, setShowIntro] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    logger.info('Showing XboxIntro', {
      component: 'Page.tsx',
      action: 'render',
    });
  }, []);

  if (error) {
    return (
      <ErrorFallback
        error={error}
        resetErrorBoundary={() => {
          setError(null);
          window.location.reload();
        }}
      />
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error: Error) => {
        logger.error('Page error boundary caught error', {
          component: 'Page',
          action: 'error',
          metadata: { error },
        });
        setError(error);
      }}
    >
      {showIntro ? <XboxIntro onIntroEnd={() => setShowIntro(false)} /> : <PartyChat />}
    </ErrorBoundary>
  );
}
