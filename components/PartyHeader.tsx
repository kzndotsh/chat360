'use client';

import Image from 'next/image';

interface PartyHeaderProps {
  membersCount: number;
}

export function PartyHeader({ membersCount }: PartyHeaderProps) {
  return (
    <div className='flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]'>
      <div className='flex flex-col sm:flex-row'>
        <div className='flex h-[40px] sm:h-[40px] order-1 sm:order-2 sm:w-[423px]'>
          <button
            onClick={() => console.log('New tab clicked')}
            className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
            <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
            <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
            <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
            <Image
              src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/green%20icon-GhlPeEt8S3QFR39zGujrpQpHiz8JOa.png'
              alt='i Icon'
              width={20}
              height={20}
              className='brightness-0 invert'
            />
            <span className='text-white text-sm'>{membersCount}</span>
          </button>
          <button
            onClick={() => console.log('Pill button clicked')}
            className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
            <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
            <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
            <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
            <Image
              src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bar-chart-Pmw7SVWQeYPUfOVRPVABZu4LM3MwsS.png'
              alt='Bar Chart Icon'
              width={23}
              height={23}
              className='opacity-100 flex items-center justify-center brightness-0 invert'
            />
          </button>
          <button
            onClick={() => console.log('X button clicked')}
            className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
            <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
            <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
            <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
            <div className='absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-black/5 to-transparent'></div>
            <Image
              src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/x%20PNG-1wTavcIcgPwf8agzEo05eifKT89DHI.png'
              alt='X Icon'
              width={23}
              height={23}
              className='opacity-100 flex items-center justify-center'
            />
          </button>
        </div>
        <div className='flex-1 bg-[#f0f0fa] h-[40px] flex items-center justify-center sm:justify-start sm:items-end order-2 sm:order-1'>
          <div className='flex items-center gap-2 mt-1 sm:mt-0 sm:mb-1 pl-[30px] w-full'>
            <Image
              src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/group%20icon-IXQUDYzJvGIdRD706igHFYwnayY9Qj.png'
              alt='Group Icon'
              width={28}
              height={28}
              className='opacity-100'
            />
            <span className='text-lg sm:text-xl font-medium text-[#282b2f]'>
              Chat360 Party
            </span>
          </div>
        </div>
      </div>
      <div className='h-[10px] bg-[#f0f0fa] border-b border-gray-200'></div>
    </div>
  );
}