'use client';

import { useEffect, useState } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if window is available (client-side)
    if (typeof window === 'undefined') return;

    // Create media query for mobile devices
    const mobileQuery = window.matchMedia('(max-width: 768px)');

    // Set initial value
    setIsMobile(mobileQuery.matches);

    // Create handler for changes
    const handleResize = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    // Add listener for changes
    mobileQuery.addEventListener('change', handleResize);

    // Cleanup
    return () => {
      mobileQuery.removeEventListener('change', handleResize);
    };
  }, []);

  return isMobile;
}
