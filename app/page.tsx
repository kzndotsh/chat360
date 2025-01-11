"use client";

import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useToast } from "@/components/ui/use-toast";
import { Mic, MicOff, Users } from 'lucide-react';

// Dynamically import components that use Agora
const VoiceChatComponent = dynamic(
  () => import('@/components/VoiceChatComponent'),
  { ssr: false }
);

export default function Home() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold">chat360</h1>
          </div>
          <VoiceChatComponent />
        </div>
      </div>
    </ErrorBoundary>
  );
}