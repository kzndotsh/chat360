// Block Agora stats collector
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Block Agora stats collector domains
  const blockedDomains = [
    'report-edge.agora.io',
    'statscollector-1.agora.io',
    'statscollector-2.agora.io',
    'statscollector-3.agora.io',
    'logservice.agora.io',
    'logservice-edge.agora.io',
    'web-logging.agora.io',
    'report.agora.io',
    'webcollector.agora.io',
    'webcollector-1.agora.io',
    'webcollector-2.agora.io',
    'webcollector-3.agora.io',
    'webrtc2-ap-web-1.agora.io',
    'webrtc2-2.ap.sd-rtn.com',
    'cds-ap-web-1.agora.io',
    'cds-web-2.ap.sd-rtn.com',
    'cds-ap-web-3.agora.io',
    'web-2.statscollector.sd-rtn.com',
  ];

  // Block any domain containing 'statscollector' or 'logservice'
  const isBlockedDomain =
    blockedDomains.includes(url.hostname) ||
    url.hostname.includes('statscollector') ||
    url.hostname.includes('logservice') ||
    url.hostname.includes('webcollector');

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

  // Let other requests pass through
  event.respondWith(fetch(event.request));
});
