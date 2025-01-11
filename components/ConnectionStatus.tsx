"use client";

import { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
}

export function ConnectionStatus({ isConnected, isConnecting }: ConnectionStatusProps) {
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (isConnecting) {
      const timer = setTimeout(() => setShowReconnecting(true), 5000);
      return () => clearTimeout(timer);
    }
    setShowReconnecting(false);
    return () => {}; // Return empty cleanup function for non-connecting state
  }, [isConnecting]);

  if (isConnecting) {
    return (
      <Badge variant="outline" className="animate-pulse">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        {showReconnecting ? 'Reconnecting...' : 'Connecting...'}
      </Badge>
    );
  }

  return (
    <Badge variant={isConnected ? "default" : "destructive"}>
      {isConnected ? 'Connected' : 'Disconnected'}
    </Badge>
  );
}