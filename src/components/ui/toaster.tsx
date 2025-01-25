"use client"

import Image from 'next/image'

import {
  Toast,
  ToastClose,
  ToastProvider,
  ToastViewport,
} from "@/components/ui/toast"

import { useToast } from "@/lib/hooks/use-toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, ...props }) {
        return (
          <Toast
            key={id}
            {...props}
            className="relative group p-0 bg-transparent border-none shadow-none w-fit data-[state=open]:animate-in data-[state=open]:slide-in-from-top-full data-[state=open]:fade-in-0 data-[state=open]:duration-300"
          >
            <Image
              alt="Achievement"
              className="h-[50px] w-auto"
              height={50}
              src="/achievement.png"
              width={50}
            />
            <ToastClose className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white" />
          </Toast>
        )
      })}
      <ToastViewport className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 m-0 z-[100] outline-none !p-0" />
    </ToastProvider>
  )
}
