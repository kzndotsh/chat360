
import Image from 'next/image';

interface PartyHeaderProps {
  membersCount: number;
}

const HEADER_BUTTON_ICONS = {
  members: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/green%20icon-GhlPeEt8S3QFR39zGujrpQpHiz8JOa.png',
  chart: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bar-chart-Pmw7SVWQeYPUfOVRPVABZu4LM3MwsS.png',
  twitter: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/x%20PNG-1wTavcIcgPwf8agzEo05eifKT89DHI.png',
  party: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/group%20icon-IXQUDYzJvGIdRD706igHFYwnayY9Qj.png',
};

const HeaderButton = ({ src, alt, children }: { src: string; alt: string; children?: React.ReactNode }) => (
  <button className="flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer">
    <div className="absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]"></div>
    <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50"></div>
    <div className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent"></div>
    <Image src={src} alt={alt} width={23} height={23} className="brightness-0 invert" />
    {children}
  </button>
);

export function PartyHeader({ membersCount }: PartyHeaderProps) {
  return (
    <div className='flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]'>
      <div className='flex flex-col sm:flex-row'>
        <div className='flex h-[40px] sm:h-[40px] order-1 sm:order-2 sm:w-[423px]'>
          <HeaderButton src={HEADER_BUTTON_ICONS.members} alt='Member Count Icon'>
            <span className='text-white text-sm'>{membersCount}</span>
          </HeaderButton>

          <HeaderButton src={HEADER_BUTTON_ICONS.chart} alt='Chart Icon' />
          
          <HeaderButton src={HEADER_BUTTON_ICONS.twitter} alt='Twitter Icon' />
        </div>

        <div className='flex-1 bg-[#f0f0fa] h-[40px] flex items-center justify-center sm:justify-start sm:items-end order-2 sm:order-1'>
          <div className='flex items-center gap-2 mt-1 sm:mt-0 sm:mb-1 pl-[30px] w-full'>
            <Image
              src={HEADER_BUTTON_ICONS.party}
              alt='Party Chat Icon'
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