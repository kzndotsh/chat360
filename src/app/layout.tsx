// "use client";

import { ReactNode } from 'react';
import type { Viewport } from 'next';
import type { Metadata } from 'next';
import { ClientProviders } from '@/components/providers/ClientProviders';

import '@/styles/globals.css';


export const metadata: Metadata = {
  title: 'Chat360',
  description: 'nostalgia, onchain.',
  metadataBase: new URL('https://chat360.fun'),
  openGraph: {
    title: 'Chat360',
    description: 'nostalgia, onchain.',
    images: [
      {
        url: '/social-1920px-1080px.png',
        width: 1920,
        height: 1080,
        alt: 'Chat360 - nostalgia, onchain.',
      },
      {
        url: '/social-1200px-630px.png',
        width: 1200,
        height: 630,
        alt: 'Chat360 - nostalgia, onchain.',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chat360',
    description: 'nostalgia, onchain.',
    images: ['/social-1920px-1080px.png', '/social-1200px-630px.png'],
    creator: '@chat360fun',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/favicons/favicon-57x57.png', sizes: '57x57', type: 'image/png' },
      { url: '/favicons/favicon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/favicons/favicon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/favicons/favicon-76x76.png', sizes: '76x76', type: 'image/png' },
      {
        url: '/favicons/favicon-114x114.png',
        sizes: '114x114',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-120x120.png',
        sizes: '120x120',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-180x180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    other: [
      {
        url: '/favicons/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-310x310.png',
        sizes: '310x310',
        type: 'image/png',
      },
      {
        url: '/favicons/favicon-150x150.png',
        sizes: '150x150',
        type: 'image/png',
      },
      { url: '/favicons/favicon-70x70.png', sizes: '70x70', type: 'image/png' },
      { url: '/favicons/browserconfig.xml', rel: 'msapplication-config' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: 'black',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="bg-black"
    >
      <body suppressHydrationWarning className="bg-black">
        <div className="min-h-screen bg-black">
          <ClientProviders>{children}</ClientProviders>
        </div>
      </body>
    </html>
  );
}
