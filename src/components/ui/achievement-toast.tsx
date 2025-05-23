import Image from 'next/image';

import { Toast, ToastClose } from '@/components/ui/toast';

interface AchievementToastProps {
  id: string;
  description?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function AchievementToast({ id, onOpenChange }: AchievementToastProps) {
  return (
    <Toast
      onOpenChange={onOpenChange}

      className="group relative w-fit overflow-visible border-none bg-transparent p-0 shadow-none data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-full"
      key={id}
    >
      <Image
        alt="Achievement"
        className="h-[100px] w-[250px] object-contain"
        height={200}
        src="/achievement.png"
        width={200}
      />
      <ToastClose className="absolute right-1.5 top-1/2 -translate-y-1/2 pl-4 text-gray-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" />
    </Toast>
  );
}
