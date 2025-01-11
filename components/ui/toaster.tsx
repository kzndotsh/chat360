"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

export function Toaster() {
  const { toast } = useToast();

  return (
    <ToastProvider>
      <ToastViewport />
    </ToastProvider>
  );
}