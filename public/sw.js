// Block Agora stats collector
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Block Agora stats collector domains
  const blockedDomains = [
    'statscollector-1.agora.io',
    'statscollector-2.agora.io',
    'statscollector-3.agora.io',
  ];

  const isBlockedDomain = blockedDomains.includes(url.hostname);

  if (isBlockedDomain) {
    console.debug('[ServiceWorker] Blocked request to:', url.hostname);

    event.respondWith(
      new Response('', {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      })
    );
    return;
  }

  // For all other requests, pass through to the network
  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch((error) => {
        console.error('[ServiceWorker] Fetch error:', error);
        throw error;
      })
  );
});
