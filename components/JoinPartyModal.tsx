import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface JoinPartyModalProps {
  onJoin: (username: string, avatar: string, status: string) => void;
  onCancel?: () => void;
  isEditMode?: boolean;
  initialData?: {
    username: string;
    avatar: string;
    status: string;
  };
}

const STATUSES = [
  'Trenching',
  'Memescope',
  'Farming Copytraders',
  'Wallet Tracking',
  'Scanning',
  'Diamond Handing',
  '6 Fig Hell',
  'Yield Maxxing',
  'Tax Evading',
  'Perps Trading',
  'Buying High Selling Low',
  'Shitposting',
  'Retiring Early',
  'PNL Flexing',
  'Larping',
  'Engagement Farming',
  'Top Blasting',
];

const AVATARS = [
  'https://i.imgur.com/LCycgcq.png',
  'https://i.imgur.com/Qrlzo59.png',
  'https://i.imgur.com/BWLZz9H.png',
  'https://i.imgur.com/oCuOi6l.png',
  'https://i.imgur.com/08d8swY.png',
  'https://i.imgur.com/6K2HjZJ.png',
  'https://i.imgur.com/hV0hK5b.png',
  'https://i.imgur.com/prPVuvk.png',
  'https://i.imgur.com/moSmzqx.png',
  'https://i.imgur.com/iqXefXu.png',
  'https://i.imgur.com/3kKBxGO.png',
  'https://i.imgur.com/W7Ru6qZ.png',
  'https://i.imgur.com/HKmELiM.png',
  'https://i.imgur.com/A4QPhdW.png',
  'https://i.imgur.com/VJDaLgc.png',
  'https://i.imgur.com/97mMl1n.png',
  'https://i.imgur.com/qc7qYPN.png',
  'https://i.imgur.com/KACYo9j.png',
  'https://i.imgur.com/toyTkGS.png',
  'https://i.imgur.com/fQ79yoT.png'
];

export const JoinPartyModal = React.memo(function JoinPartyModal({
  onJoin,
  onCancel,
  isEditMode = false,
  initialData,
}: JoinPartyModalProps) {
  const [username, setUsername] = useState(initialData?.username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(
    initialData?.avatar || AVATARS[0],
  );
  const [selectedStatus, setSelectedStatus] = useState(
    initialData?.status || STATUSES[0],
  );
  const [canCancel, setCanCancel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Only allow cancel if we're in edit mode OR there's a stored user
    const storedUser = localStorage.getItem('currentUser');
    const shouldAllowCancel = isEditMode || !!storedUser;
    setCanCancel(shouldAllowCancel);

    // Only load stored data if we're not in edit mode and there's no initial data
    if (!isEditMode && !initialData && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUsername(user.name || '');
        setSelectedAvatar(user.avatar || AVATARS[0]);
        setSelectedStatus(user.game || STATUSES[0]);
      } catch (e) {
        console.error('Failed to parse stored user data:', e);
      }
    }
  }, [isEditMode, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const avatar = selectedAvatar || AVATARS[0];
    const status = selectedStatus || STATUSES[0];

    setTimeout(() => {
      setIsSubmitting(false);
      onJoin(username.trim(), avatar, status);
    }, 300);
  };

  const handleCancel = () => {
    if (canCancel && onCancel) {
      onCancel();
    }
  };

  const modalTitle = useMemo(() => 
    isEditMode ? 'Edit Profile' : 'Join Chat360 Party'
  , [isEditMode]);

  const buttonText = useMemo(() => 
    isEditMode ? 'Save Changes' : 'Join Party'
  , [isEditMode]);

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-[#f0f0fa] w-full max-w-md p-6 shadow-lg'>
        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-xl font-bold text-[#161718]'>
            {modalTitle}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label
              htmlFor='username'
              className='block text-sm font-medium text-[#161718] mb-1'>
              Username
            </label>
            <Input
              type='text'
              id='username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm',
                'focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83]',
                'text-black transition-colors',
                error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
              )}
              required
              disabled={isSubmitting}
            />
            {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
          </div>

          <div>
            <label className='block text-sm font-medium text-[#161718] mb-1'>
              Select Avatar
            </label>
            <div className='grid grid-cols-5 gap-2'>
              {AVATARS.map((avatar, index) => (
                <button
                  key={index}
                  type='button'
                  onClick={() => setSelectedAvatar(avatar)}
                  disabled={isSubmitting}
                  className={`w-12 h-12 rounded-md overflow-hidden ${
                    selectedAvatar === avatar ? 'ring-[3px] ring-[#55b611]' : ''
                  }`}>
                  <Image
                    src={avatar}
                    alt={`Avatar ${index + 1}`}
                    width={48}
                    height={48}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor='status'
              className='block text-sm font-medium text-[#161718] mb-1'>
              Status
            </label>
            <Select
              id='status'
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm',
                'focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] text-black'
              )}
              disabled={isSubmitting}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          <div className='flex justify-between items-center'>
            <Button
              type='button'
              onClick={handleCancel}
              disabled={!canCancel || isSubmitting}
              className={cn(
                'flex items-center gap-2 px-4 py-2 border-2 rounded-none transition-colors',
                canCancel 
                  ? 'border-[#ae1228] hover:bg-[#ae1228] group' 
                  : 'border-gray-400 bg-transparent opacity-50 cursor-not-allowed pointer-events-none'
              )}>
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs',
                canCancel ? 'bg-[#ae1228]' : 'bg-gray-400'
              )}>
                B
              </div>
              <span className={cn(
                'text-[#161718]',
                canCancel ? 'group-hover:text-white' : 'text-gray-400'
              )}>
                Cancel
              </span>
            </Button>

            <Button
              type='submit'
              disabled={isSubmitting}
              className='flex items-center gap-2 px-4 py-2 border-2 border-[#55b611] rounded-none transition-colors hover:bg-[#55b611] group'>
              <div className='w-6 h-6 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-xs'>
                A
              </div>
              <span className='text-[#161718] group-hover:text-white'>
                {isSubmitting ? 'Loading...' : buttonText}
              </span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
});