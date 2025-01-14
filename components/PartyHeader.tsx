'use client';

import { UserIcon } from './icons/UserIcon';
import { UserGroupIcon } from './icons/UserGroupIcon';

import { TbBrandX } from 'react-icons/tb';
import { BiSolidBarChartAlt2 } from 'react-icons/bi';

interface PartyHeaderProps {
  membersCount: number;
}

const HeaderButton = ({
  icon: Icon,
  alt,
  children,
  iconSize = 'w-7 h-7',
  width = 'w-[141px]',
}: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  alt: string;
  children?: React.ReactNode;
  iconSize?: string;
  width?: string;
}) => (
  <button
    className={`flex items-center justify-center ${width} relative h-[40px] cursor-pointer bg-[#6B717D] transition-colors hover:bg-[#5D626D]`}
  >
    <div className="absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]"></div>
    <div className="absolute bottom-0 left-0 top-0 w-[1px] bg-[#5D626D]/50"></div>
    <div className="absolute bottom-0 left-0 top-0 w-5 bg-gradient-to-r from-black/5 to-transparent"></div>
    <Icon className={`${iconSize} text-white opacity-90`} />
    {children}
  </button>
);

export function PartyHeader({ membersCount }: PartyHeaderProps) {
  return (
    <div className="flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col sm:flex-row">
        <div className="order-2 flex h-[40px] flex-1 items-center justify-center bg-[#f8f8f8] sm:order-1 sm:items-center sm:justify-start">
          <div className="flex w-full items-center gap-2 pl-[30px] sm:mt-0">
            <UserGroupIcon className="w-10 text-[#282b2f] opacity-90" />
            <span className="text-lg font-medium text-[#282b2f] sm:text-xl">
              Chat360 Party
            </span>
          </div>
        </div>

        <div className="order-1 flex h-[40px] sm:order-2">
          <HeaderButton
            icon={UserIcon}
            alt="Member Count Icon"
            iconSize="w-7 h-6"
          >
            <span className="text-bold ml-2 text-sm text-white opacity-90">
              {membersCount}
            </span>
          </HeaderButton>

          <HeaderButton
            icon={BiSolidBarChartAlt2}
            alt="Chart Icon"
            iconSize="w-7 h-7"
          />

          <HeaderButton icon={TbBrandX} alt="Twitter Icon" iconSize="w-7 h-7" />
        </div>
      </div>
      <div className="h-[10px] border-b border-[#e5e5e5] bg-[#f8f8f8]"></div>
    </div>
  );
}
