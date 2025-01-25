import React, { memo } from 'react';

import Image from 'next/image';

import { AVATARS } from '@/lib/constants';
import { useParty } from '@/lib/contexts/partyContext';

import Clock from './Clock';

export const TopBar = memo(() => {
  const { currentMember } = useParty();

  return (
    <div className="relative mb-3 flex h-[65px] w-full items-end justify-between px-4 md:px-8">
      <div className="flex items-center">
        <span className="text-xl font-medium leading-none text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] md:text-2xl">
          $360
        </span>
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 md:bottom-auto md:top-0">
        <Image
          alt={currentMember?.name ?? 'Default Avatar'}
          className="h-[50px] w-[50px] object-cover md:h-[65px] md:w-[65px]"
          height={65}
          src={currentMember?.avatar ?? AVATARS[0]!}
          width={65}
        />
      </div>
      <div className="flex items-center">
        <Clock />
      </div>
    </div>
  );
});
TopBar.displayName = 'TopBar';
