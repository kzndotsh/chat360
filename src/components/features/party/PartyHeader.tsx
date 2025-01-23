'use client';

import type { PartyHeaderProps } from '@/lib/types/components/props';

import React, { useRef, useState } from 'react';

import { Clipboard } from 'lucide-react';
import { BiSolidBarChartAlt2 } from 'react-icons/bi';
import { TbBrandX } from 'react-icons/tb';

import { logger } from '@/lib/logger';

import { Chat360Icon } from './icons/Chat360Icon';
import { UserIcon } from './icons/UserIcon';

const HeaderButton = ({
  icon: Icon,
  iconSize = 'w-7 h-7',
  width = 'w-[170px]',
  children,
  url,
}: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  iconSize?: string;
  width?: string;
  children?: React.ReactNode;
  url?: string;
}) => {
  const ButtonContent = (
    <button
      className={`flex items-center justify-center ${width} relative h-[50px] cursor-pointer bg-[#6B717D] transition-colors hover:bg-[#5D626D]`}
    >
      <div className="absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]"></div>
      <div className="absolute bottom-0 left-0 top-0 w-[1px] bg-[#5D626D]/50"></div>
      <div className="absolute bottom-0 left-0 top-0 w-5 bg-gradient-to-r from-black/5 to-transparent"></div>
      <Icon className={`${iconSize} text-white opacity-90`} />
      {children}
    </button>
  );

  return url ? (
    <a href={url} rel="noopener noreferrer" target="_blank">
      {ButtonContent}
    </a>
  ) : ButtonContent;
};

export function PartyHeader({ membersCount }: PartyHeaderProps) {
  const [copyStatus, setCopyStatus] = useState<'error' | 'idle' | 'success'>('idle');
  const loggerRef = useRef(logger);

  const handleCopyURL = async () => {
    loggerRef.current.info('Attempting to copy party URL', {
      component: 'PartyHeader',
      action: 'copyURL',
      metadata: { url: window.location.href },
    });

    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus('success');
      loggerRef.current.info('Successfully copied party URL', {
        component: 'PartyHeader',
        action: 'copyURL',
        metadata: { status: 'success', url: window.location.href },
      });
      setTimeout(() => {
        setCopyStatus('idle');
        loggerRef.current.debug('Reset copy status', {
          component: 'PartyHeader',
          action: 'resetCopyStatus',
        });
      }, 2000);
    } catch (error) {
      loggerRef.current.error('Failed to copy URL to clipboard', {
        component: 'PartyHeader',
        action: 'copyURL',
        metadata: {
          error: error instanceof Error ? error : new Error(String(error)),
          url: window.location.href,
        },
      });
      setCopyStatus('error');
      setTimeout(() => {
        setCopyStatus('idle');
        loggerRef.current.debug('Reset copy status', {
          component: 'PartyHeader',
          action: 'resetCopyStatus',
        });
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') {
      loggerRef.current.debug('Copy URL triggered via keyboard', {
        component: 'PartyHeader',
        action: 'keyPress',
        metadata: { key: e.key },
      });
      e.currentTarget.click();
    }
  };

  // Log initial render with member count
  React.useEffect(() => {
    loggerRef.current.debug('Party header rendered', {
      component: 'PartyHeader',
      action: 'render',
      metadata: { membersCount },
    });
  }, [membersCount]);

  return (
    <div
      className="flex flex-col items-center justify-between"
      role="banner"
    >
      <div className="flex w-full flex-col sm:flex-row">
        <div className="order-2 flex h-[50px] flex-1 items-center justify-between bg-[#f7ffff] sm:order-1">
          <div className="flex items-center gap-2 pl-[30px]">
            <Chat360Icon className="w-14 h-14 text-[#282b2f] opacity-90" />
            <span className="text-2xl font-semibold text-[#282b2f]">Chat360 Party</span>
          </div>
        </div>

        <div className="order-1 flex h-[40px] sm:order-2">
          <HeaderButton
            icon={UserIcon}
            iconSize="w-7 h-6"
          >
            <span className="font-bold ml-2 truncate text-sm text-white opacity-90">
              {membersCount}
            </span>
          </HeaderButton>

          <HeaderButton
            icon={BiSolidBarChartAlt2}
            iconSize="w-7 h-7"
          />

          <HeaderButton
            icon={TbBrandX}
            iconSize="w-7 h-7"
            url="https://x.com/chat360fun"
          />
        </div>
      </div>

      <div className="h-[15px] w-full border-b border-gray-200 bg-[#f7ffff]"></div>

      <button
        onClick={handleCopyURL}
        onKeyDown={handleKeyDown}

        aria-label="Copy CA"
        aria-live="polite"
        className="flex h-[40px] w-full cursor-pointer items-center gap-2 bg-gradient-to-b from-[#70cc00] to-[#409202] pl-[30px] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all hover:brightness-110"
      >
        <span className="text-xl font-semibold text-white">
          {copyStatus === 'success' ? 'Copied!' : copyStatus === 'error' ? 'Failed!' : 'Copy CA'}
        </span>
        <Clipboard className="h-4 w-4 text-white opacity-90" />
      </button>

      <div className="h-[40px] w-full border-b border-gray-400 bg-[#eff3f6] pl-[30px]">
        <span className="text-xl font-semibold leading-[38px] text-[#282b2f]">
          Party Options: Party Chat
        </span>
      </div>
    </div>
  );
}
