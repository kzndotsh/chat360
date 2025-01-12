import React, { useState, useEffect } from 'react';
import Image from 'next/image';

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

const statuses = [
  'Trenching',
  'Memescope',
  'Farming Copytraders',
  'Wallet Tracking',
  'Scanning',
  '6 Fig Hell',
  'Perps Trading',
  'Shitposting',
  'Engagement Farming',
  'PNL Flexing',
  'Larping',
  'Top Blasting',
  'Jeeting',
];

const avatars = [
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1-IB9eM22EpU08YXDc3nw6adMhpF0hw9.png', // Pink-haired anime
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2-jCPkn89wFGRmOildMGeRVfLjCtKDg9.png', // Golden retriever
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/3-rCZkbLqBT84uMuBL2JU0Pvsj5Dbyz6.png', // Soccer ball
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/4-SbS3XVii5jmXc3zh2WKqhecuBCeG8X.png', // Skull
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/5-cdmF7rgi80VcXKEqhauWFh8W8lJEMk.png', // Monkey
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/6-KyHlLHHrzklc1CP9q8ru5UebF6b4vL.png', // Beanie character
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/7-9avtbj5uIcozNQ6hmPfcMIYgIrQPGd.png', // Dragon
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/8-HIwzfdncAzYMnRIlMGHeztpmkMQW8v.png', // Blue character
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/9-QHOYpUexLNIhrfVcZMnmOBQwKzpQx4.png', // Eye patch character
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/10-xezCxyYowSEDzrBbNNOJUehVp0EKzW.png', // Panda
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/14-DTfjPpF0PGghW1gOzlWFLbuKZOgfe1.png', // MLG logo
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/17-F48ifTFVyVNgnpp9syiNPq6JKyjck2.png', // Red angry eyes
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/19-Os71lNtBOQ4wCmtGlfYdXVIyUjW7ry.png', // Blue worried face
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/13-0jMhIxKYo85JnYOrT8d2hiDXfHYplL.png', // Dark skull-like face
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/12-Bip5gxoViGbdaO7381wn8yDQBtlOXL.png', // Green blob character
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/15-j0KGqr8f4e8lEW8JhmqwT9a8IXCPoG.png', // Green monster
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/11-jWcYWjoKfCDC8g9qRxbaRqM6PlZVix.png', // Yellow smiley
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/18-gQVJ5kr9misrib6qqmQOIHUaToN6Vm.png', // Green alien
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/16-1LA33FBnMJjUloqSXh6h9DiUeZLFQq.png', // Green spiral background
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/20-Ba9FCsgdz0vV1JSJC0OiudB4ZUMigP.png', // Clown face
];

export function JoinPartyModal({
  onJoin,
  onCancel,
  isEditMode = false,
  initialData,
}: JoinPartyModalProps) {

  const [username, setUsername] = useState(initialData?.username || '');
  
  const [ selectedAvatar, setSelectedAvatar ] = useState(
    initialData?.avatar || avatars[0],
  );
  
  const [ selectedStatus, setSelectedStatus ] = useState(
    initialData?.status || statuses[0],
  );

  const [canCancel, setCanCancel] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setUsername(user.name || '');
      setSelectedAvatar(user.avatar || avatars[0] || '');
      setSelectedStatus(user.game || statuses[0] || '');
    }
    setCanCancel(!!storedUser);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const avatar = selectedAvatar || avatars[0] || '';
    const status = selectedStatus || statuses[0] || '';

    onJoin(username.trim(), avatar, status);
  };

  const handleCancel = () => {
    if (canCancel && onCancel) {
      onCancel();
    }
  };

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-[#f0f0fa] w-full max-w-md p-6 shadow-lg'>
        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-xl font-bold text-[#161718]'>
            {isEditMode ? 'Edit Profile' : 'Join Chat360 Party'}
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className='space-y-4'>
          <div>
            <label
              htmlFor='username'
              className='block text-sm font-medium text-[#161718] mb-1'>
              Username
            </label>

            <input
              type='text'
              id='username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] text-black'
              required
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-[#161718] mb-1'>
              Select Avatar
            </label>

            <div className='grid grid-cols-5 gap-2'>
              {avatars.map((avatar, index) => (
                <button
                  key={index}
                  type='button'
                  onClick={() => setSelectedAvatar(avatar)}
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

            <select
              id='status'
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] text-black'>
              {statuses.map((status) => (
                <option
                  key={status}
                  value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className='flex justify-between items-center'>
            <button
              type='button'
              onClick={handleCancel}
              className={`flex items-center gap-2 px-4 py-2 border-2 border-[#ae1228] rounded-none transition-opacity ${
                canCancel
                  ? 'hover:bg-[#ae1228] hover:text-white'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              disabled={!canCancel}>
              <div className='w-6 h-6 rounded-full bg-[#ae1228] flex items-center justify-center text-white font-bold text-xs'>
                B
              </div>

              <span className='text-[#161718] group-hover:text-white'>
                Cancel
              </span>
            </button>

            <button
              type='submit'
              className='flex items-center gap-2 px-4 py-2 border-2 border-[#55b611] rounded-none transition-opacity hover:bg-[#55b611] hover:text-white'>
              <div className='w-6 h-6 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-xs'>
                A
              </div>

              <span className='text-[#161718] group-hover:text-white'>
                {isEditMode ? 'Save Changes' : 'Join Party'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
