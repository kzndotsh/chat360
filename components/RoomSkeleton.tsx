'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function RoomSkeleton() {
  return (
    <div className='min-h-screen relative flex items-center justify-center bg-black tracking-wide overflow-hidden'>
      {/* Video Background Skeleton */}
      <div className='absolute inset-0 z-0'>
        <div className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto bg-gray-900 animate-pulse' />
      </div>

      {/* Overlay */}
      <div className='absolute inset-0 bg-black opacity-55 z-10'></div>

      <div className='relative z-20 w-full max-w-[825px] mx-auto p-4 sm:p-6'>
        {/* Header */}
        <div className='flex items-end justify-between mb-2'>
          <Skeleton className='h-7 w-16 bg-gray-700' />
          <Skeleton className='w-[47px] h-[47px] sm:w-[64px] sm:h-[64px] rounded-none bg-gray-700' />
          <Skeleton className='h-7 w-16 bg-gray-700' />
        </div>

        <Card className='bg-[#f0f0fa] border-0 mb-2 rounded-none relative overflow-hidden shadow-none text-[#161718] aspect-[16/9.75]'>
          {/* Header Skeleton */}
          <div className='flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]'>
            <div className='flex flex-col sm:flex-row'>
              <div className='flex h-[40px] sm:h-[40px] order-1 sm:order-2 sm:w-[423px]'>
                {[1, 2, 3].map((i) => (
                  <div key={i} className='flex-1 bg-gray-300 animate-pulse' />
                ))}
              </div>
              <div className='flex-1 bg-[#f0f0fa] h-[40px] flex items-center justify-center sm:justify-start sm:items-end order-2 sm:order-1'>
                <div className='flex items-center gap-2 mt-1 sm:mt-0 sm:mb-1 pl-[30px] w-full'>
                  <Skeleton className='w-7 h-7 bg-gray-300' />
                  <Skeleton className='h-7 w-32 bg-gray-300' />
                </div>
              </div>
            </div>
            <div className='h-[10px] bg-[#f0f0fa] border-b border-gray-200'></div>
          </div>

          {/* Invite Button Skeleton */}
          <div className='bg-gray-300 animate-pulse h-[38px] pl-[30px] flex items-center'>
            <Skeleton className='h-6 w-24 bg-gray-400' />
          </div>

          {/* Party Options Skeleton */}
          <div className='bg-[#f0f0fa] py-[6px] pl-[30px] border-b border-gray-400'>
            <Skeleton className='h-6 w-48 bg-gray-300' />
          </div>

          {/* Member List Skeleton */}
          <div className='max-h-[381px] overflow-y-auto'>
            {Array(7).fill(null).map((_, i) => (
              <div key={i} className='flex items-center py-0.5 px-2 border-t first:border-t-0 border-gray-400'>
                <div className='flex items-center gap-1 w-[202px] sm:w-[440px] -ml-7'>
                  <Skeleton className='w-8 h-8 sm:w-9 sm:h-9 ml-5 bg-gray-300' />
                  <Skeleton className='w-7 h-7 sm:w-8 sm:h-8 ml-1 bg-gray-300' />
                  <Skeleton className='flex-1 h-6 bg-gray-300' />
                </div>
                <div className='w-[23px] ml-[-55px] sm:ml-[-50px]'>
                  <Skeleton className='w-4 h-4 sm:w-6 sm:h-6 bg-gray-300' />
                </div>
                <div className='flex-1 ml-[-38px] sm:ml-[59px]'>
                  <Skeleton className='h-6 w-32 bg-gray-300' />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Controls Skeleton */}
        <div className='flex flex-wrap items-center gap-1 sm:gap-2 mt-1 px-[30px]'>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className='flex items-center gap-0 sm:gap-2'>
              <Skeleton className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-700' />
              <Skeleton className='h-4 w-16 sm:w-20 bg-gray-700' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}