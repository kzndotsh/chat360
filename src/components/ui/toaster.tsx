'use client';

import dynamic from 'next/dynamic';

import { IoVolumeMuteSharp, IoVolumeHighSharp } from 'react-icons/io5';

import { Toast, ToastClose, ToastProvider, ToastViewport } from '@/components/ui/toast';

import { useToast } from '@/lib/hooks/use-toast';

const DynamicAchievementToast = dynamic(
  () => import('@/components/ui/achievement-toast').then(mod => mod.AchievementToast),
  {
    loading: () => null, // Achievement toast can appear with a slight delay
    ssr: false // No need to render achievement on server
  }
);

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, description, ...props }) {
        const descriptionText = description?.toString() || '';
        const isMuteAction = descriptionText.toLowerCase().includes('microphone');
        const isJoinAction = descriptionText.toLowerCase().includes('joined the party');

        if (isJoinAction) {
          return (
            <DynamicAchievementToast
              description={description}
              id={id}
              key={id}
              {...props}
            />
          );
        }

        return (
          <Toast
            key={id}
            {...props}
            className="group relative flex w-auto min-w-[200px] items-center justify-center gap-1 rounded-sm border border-[#ACD43B]/30 bg-[#424240] pl-3 pr-6 py-1.5 text-white shadow-[0_0_15px_rgba(170,205,67,0.2)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-full"
          >
            <div className="flex items-center justify-center gap-1">
              {isMuteAction && (
                descriptionText.toLowerCase().includes('muted') ? (
                  <IoVolumeMuteSharp className="h-4 w-4 text-[#ACD43B]" />
                ) : (
                  <IoVolumeHighSharp className="h-4 w-4 text-[#ACD43B]" />
                )
              )}
              <div className="text-sm font-medium text-white">{description}</div>
            </div>
            <ToastClose className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" />
          </Toast>
        );
      })}
      <ToastViewport className="fixed left-1/2 top-6 z-[100] m-0 flex -translate-x-1/2 flex-col items-center gap-2 !p-0 outline-none" />
    </ToastProvider>
  );
}
