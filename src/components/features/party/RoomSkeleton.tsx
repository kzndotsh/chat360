'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export function RoomSkeleton() {
  return (
    <div 
      data-testid="room-skeleton"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black tracking-wide will-change-transform"
    >
      {/* Video Background Skeleton */}
      <div className="absolute inset-0 z-0">
        <div 
          data-testid="video-background-skeleton"
          className="absolute left-1/2 top-1/2 h-auto min-h-full w-auto min-w-full -translate-x-1/2 -translate-y-1/2 transform animate-pulse bg-gray-900" 
        />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 z-10 bg-black opacity-55"></div>

      <div className="relative z-20 mx-auto w-full max-w-[825px] p-4 sm:p-6">
        {/* Header */}
        <div className="mb-2 flex items-end justify-between">
          <Skeleton data-testid="header-skeleton-left" className="h-7 w-16 bg-gray-700" />
          <Skeleton data-testid="header-skeleton-center" className="h-[47px] w-[47px] rounded-none bg-gray-700 sm:h-[64px] sm:w-[64px]" />
          <Skeleton data-testid="header-skeleton-right" className="h-7 w-16 bg-gray-700" />
        </div>

        <Card className="relative mb-2 aspect-[16/9.75] overflow-hidden rounded-none border-0 bg-[#f0f0fa] text-[#161718] shadow-none">
          {/* Header Skeleton */}
          <div className="flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
            <div className="flex flex-col sm:flex-row">
              <div className="order-1 flex h-[40px] sm:order-2 sm:h-[40px] sm:w-[423px]">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    data-testid={`header-button-skeleton-${i}`}
                    className="flex-1 animate-pulse bg-gray-300"
                  />
                ))}
              </div>
              <div className="order-2 flex h-[40px] flex-1 items-center justify-center bg-[#f0f0fa] sm:order-1 sm:items-end sm:justify-start">
                <div className="mt-1 flex w-full items-center gap-2 pl-[30px] sm:mb-1 sm:mt-0">
                  <Skeleton data-testid="party-icon-skeleton" className="h-7 w-7 bg-gray-300" />
                  <Skeleton data-testid="party-name-skeleton" className="h-7 w-32 bg-gray-300" />
                </div>
              </div>
            </div>
            <div className="h-[10px] border-b border-gray-200 bg-[#f0f0fa]"></div>
          </div>

          {/* Invite Button Skeleton */}
          <div className="flex h-[38px] animate-pulse items-center bg-gray-300 pl-[30px]">
            <Skeleton data-testid="invite-button-skeleton" className="h-6 w-24 bg-gray-400" />
          </div>

          {/* Party Options Skeleton */}
          <div className="border-b border-gray-400 bg-[#f0f0fa] py-[6px] pl-[30px]">
            <Skeleton data-testid="party-options-skeleton" className="h-6 w-48 bg-gray-300" />
          </div>

          {/* Member List Skeleton */}
          <div className="max-h-[381px] overflow-y-auto">
            {Array(7)
              .fill(null)
              .map((_, i) => (
                <div
                  key={i}
                  data-testid={`member-skeleton-${i}`}
                  className="flex items-center border-t border-gray-400 px-2 py-0.5 first:border-t-0"
                >
                  <div className="-ml-7 flex w-[202px] items-center gap-1 sm:w-[440px]">
                    <Skeleton data-testid={`member-avatar-skeleton-${i}`} className="ml-5 h-8 w-8 bg-gray-300 sm:h-9 sm:w-9" />
                    <Skeleton data-testid={`member-status-skeleton-${i}`} className="ml-1 h-7 w-7 bg-gray-300 sm:h-8 sm:w-8" />
                    <Skeleton data-testid={`member-name-skeleton-${i}`} className="h-6 flex-1 bg-gray-300" />
                  </div>
                  <div className="ml-[-55px] w-[23px] sm:ml-[-50px]">
                    <Skeleton data-testid={`member-mic-skeleton-${i}`} className="h-4 w-4 bg-gray-300 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-[-38px] flex-1 sm:ml-[59px]">
                    <Skeleton data-testid={`member-game-skeleton-${i}`} className="h-6 w-32 bg-gray-300" />
                  </div>
                </div>
              ))}
          </div>
        </Card>

        {/* Controls Skeleton */}
        <div className="mt-1 flex flex-wrap items-center gap-1 px-[30px] sm:gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              data-testid={`control-skeleton-${i}`}
              className="flex items-center gap-0 sm:gap-2"
            >
              <Skeleton data-testid={`control-icon-skeleton-${i}`} className="h-3 w-3 rounded-full bg-gray-700 sm:h-4 sm:w-4" />
              <Skeleton data-testid={`control-text-skeleton-${i}`} className="h-4 w-16 bg-gray-700 sm:w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
