'use client';

import { Suspense } from 'react';

import dynamic from 'next/dynamic';

const MainContent = dynamic(() => import('@/components/features/MainContent'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 min-h-screen overflow-hidden" />,
});

export default function Home() {
  return (
    <Suspense fallback={<div className="fixed inset-0 min-h-screen overflow-hidden bg-white" />}>
      <MainContent />
    </Suspense>
  );
}
