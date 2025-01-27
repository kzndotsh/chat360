'use client';

import type { PartyHeaderProps } from '@/lib/types/components/props';

import React, { useRef, useState, useCallback, useEffect } from 'react';

import { Clipboard } from 'lucide-react';
import { BiSolidBarChartAlt2 } from 'react-icons/bi';
import { TbBrandX } from 'react-icons/tb';

import { logger } from '@/lib/logger';

import { Chat360Icon } from './icons/Chat360Icon';
import { UserIcon } from './icons/UserIcon';

const HEADER_CONFIG = {
  COPY_CA_VALUE: '',
  TWITTER_URL: 'https://x.com/chat360fun',
  CHART_URL: '',
} as const;

const MemoizedUserIcon = React.memo(UserIcon);
const MemoizedBarChartIcon = React.memo(BiSolidBarChartAlt2);
const MemoizedXIcon = React.memo(TbBrandX);
const MemoizedChat360Icon = React.memo(Chat360Icon);

const HeaderButton = React.memo(({
  icon: Icon,
  iconSize = 'w-7 h-7',
  width = 'w-[170px]',
  children,
  url,
  onClick,
}: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  iconSize?: string;
  width?: string;
  children?: React.ReactNode;
  url?: string;
  onClick?: () => void;
}) => {
  const ButtonContent = (
    <button
      onClick={onClick}

      className={`relative flex cursor-pointer items-center justify-center bg-[#6B717D] transition-colors ${width} ${children ? 'h-[35px] sm:h-[50px]' : 'h-[35px] sm:h-[50px]'} group overflow-hidden`}
    >
      <div className="absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]"></div>
      <div className="absolute bottom-0 left-0 top-0 w-[1px] bg-[#5D626D]/50"></div>
      <div className="absolute bottom-0 right-0 top-0 w-[1px] bg-[#5D626D]/50"></div>
      <div className="absolute bottom-0 left-0 top-0 w-5 bg-gradient-to-r from-black/5 to-transparent"></div>
      <div className="absolute inset-0 bg-black/0 transition-all duration-200 group-hover:bg-black/10"></div>
      <Icon className={`${iconSize} text-white opacity-90 relative z-10`} />
      {children && <div className="relative z-10">{children}</div>}
    </button>
  );

  return url ? (
    <a
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {ButtonContent}
    </a>
  ) : (
    ButtonContent
  );
});

HeaderButton.displayName = 'HeaderButton';

const MobileButtons = React.memo(({ membersCount }: { membersCount: number }) => (
  <>
    <div className="flex h-[35px] w-full sm:hidden">
      <div className="flex-1">
        <HeaderButton
          icon={MemoizedBarChartIcon}
          iconSize="w-6 h-6"
          url={HEADER_CONFIG.CHART_URL}
          width="w-full"
        />
      </div>
      <div className="flex-1">
        <HeaderButton
          icon={MemoizedXIcon}
          iconSize="w-6 h-6"
          url={HEADER_CONFIG.TWITTER_URL}
          width="w-full"
        />
      </div>
    </div>

    <div className="h-[35px] w-full sm:hidden">
      <HeaderButton
        icon={MemoizedUserIcon}
        iconSize="w-6 h-5"
        width="w-full"
      >
        <span className="ml-2 truncate text-xs font-bold text-white opacity-90 sm:text-sm">
          {membersCount}
        </span>
      </HeaderButton>
    </div>
  </>
));

MobileButtons.displayName = 'MobileButtons';

const DesktopButtons = React.memo(({ membersCount }: { membersCount: number }) => (
  <div className="hidden sm:flex">
    <HeaderButton
      icon={MemoizedUserIcon}
      iconSize="w-7 h-6"
      width="w-[140px]"
    >
      <span className="ml-2 truncate text-sm font-bold text-white opacity-90">
        {membersCount}
      </span>
    </HeaderButton>

    <HeaderButton
      icon={MemoizedBarChartIcon}
      iconSize="w-7 h-7"
      url={HEADER_CONFIG.CHART_URL}
      width="w-[140px]"
    />

    <HeaderButton
      icon={MemoizedXIcon}
      iconSize="w-7 h-7"
      url={HEADER_CONFIG.TWITTER_URL}
      width="w-[140px]"
    />
  </div>
));

DesktopButtons.displayName = 'DesktopButtons';

const Logo = React.memo(() => (
  <div className="order-2 flex h-[50px] flex-1 items-center justify-center bg-[#f7ffff] pt-0 sm:order-1 sm:justify-start sm:py-0">
    <div className="flex items-center gap-2 sm:pl-[30px]">
      <MemoizedChat360Icon className="h-14 w-14 text-[#282b2f] opacity-90" />
      <span className="text-2xl font-semibold text-[#282b2f]">Chat360 Party</span>
    </div>
  </div>
));

Logo.displayName = 'Logo';

export const PartyHeader = React.memo(
  function PartyHeader({ membersCount }: PartyHeaderProps) {
    const [copyStatus, setCopyStatus] = useState<'error' | 'idle' | 'success'>('idle');
    const loggerRef = useRef(logger);
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const handleCopyURL = useCallback(async () => {
      loggerRef.current.info('Attempting to copy party URL', {
        component: 'PartyHeader',
        action: 'copyURL',
        metadata: { url: HEADER_CONFIG.COPY_CA_VALUE },
      });

      try {
        await navigator.clipboard.writeText(HEADER_CONFIG.COPY_CA_VALUE);
        setCopyStatus('success');
        loggerRef.current.info('Successfully copied party URL', {
          component: 'PartyHeader',
          action: 'copyURL',
          metadata: { status: 'success', url: HEADER_CONFIG.COPY_CA_VALUE },
        });

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
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
            url: HEADER_CONFIG.COPY_CA_VALUE,
          },
        });
        setCopyStatus('error');

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setCopyStatus('idle');
          loggerRef.current.debug('Reset copy status', {
            component: 'PartyHeader',
            action: 'resetCopyStatus',
          });
        }, 2000);
      }
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter') {
        loggerRef.current.debug('Copy URL triggered via keyboard', {
          component: 'PartyHeader',
          action: 'keyPress',
          metadata: { key: e.key },
        });
        e.currentTarget.click();
      }
    }, []);

    useEffect(() => {
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
          <Logo />
          <div className="order-1 flex h-[70px] w-full flex-col gap-0 sm:order-2 sm:h-[40px] sm:w-auto sm:flex-row sm:gap-0">
            <MobileButtons membersCount={membersCount} />
            <DesktopButtons membersCount={membersCount} />
          </div>
        </div>

        <div className="hidden h-[15px] w-full border-b border-gray-200 bg-[#f7ffff] sm:block"></div>

        <button
          onClick={handleCopyURL}
          onKeyDown={handleKeyDown}

          aria-label="Copy CA"
          aria-live="polite"
          className="flex h-[40px] sm:h-[40px] w-full cursor-pointer items-center gap-2 bg-gradient-to-b from-[#70cc00] to-[#409202] pl-[30px] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all hover:brightness-110"
        >
          <span className="text-lg sm:text-xl font-semibold text-white">
            {copyStatus === 'success' ? 'Copied!' : copyStatus === 'error' ? 'Failed!' : 'Copy CA'}
          </span>
          <Clipboard className="h-4 w-4 text-white opacity-90" />
        </button>

        <div className="h-[35px] sm:h-[40px] w-full border-b border-gray-400 bg-[#eff3f6] pl-[30px]">
          <span className="text-lg sm:text-xl font-semibold leading-[35px] sm:leading-[38px] text-[#282b2f]">
            Party Options: Party Chat
          </span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.membersCount === nextProps.membersCount
);
