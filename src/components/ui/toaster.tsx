'use client';

import Image from 'next/image';

import { Toast, ToastClose, ToastProvider, ToastViewport } from '@/components/ui/toast';

import { useToast } from '@/lib/hooks/use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, ...props }) {
        return (
          <Toast
            key={id}
            {...props}
            className="group relative w-fit border-none bg-transparent p-0 shadow-none data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-full"
          >
            <Image
              alt="Achievement"
              className="h-[50px] w-auto"
              height={50}
              src="/achievement.png"
              unoptimized={true}
              width={50}
            />
            <ToastClose className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" />
          </Toast>
        );
      })}
      <ToastViewport className="fixed left-1/2 top-6 z-[100] m-0 flex -translate-x-1/2 flex-col items-center gap-2 !p-0 outline-none" />
    </ToastProvider>
  );
}
