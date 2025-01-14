// "use client";

// import React, { useState, useEffect, useMemo } from 'react';
// import * as Sentry from '@sentry/react';
// import Image from 'next/image';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Select } from '@/components/ui/select';
// import { cn } from '@/lib/utils';
// import { AVATARS, STATUSES } from '@/lib/constants';
// import { logWithContext } from '@/lib/logger';

// interface JoinPartyModalProps {
//   onJoin: (username: string, avatar: string, status: string) => void;
//   onCancel?: () => void;
//   isEditMode?: boolean;
//   initialData?: {
//     username: string;
//     avatar: string;
//     status: string;
//   };
// }

// export const JoinPartyModal = React.memo(function JoinPartyModal({
//   onJoin,
//   onCancel,
//   isEditMode = false,
//   initialData,
// }: JoinPartyModalProps) {
//   const [username, setUsername] = useState(initialData?.username || '');
//   const [selectedAvatar, setSelectedAvatar] = useState(initialData?.avatar || AVATARS[0]);
//   const [selectedStatus, setSelectedStatus] = useState(initialData?.status || STATUSES[0]);
  
//   const [canCancel, setCanCancel] = useState(false);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     const storedUser = localStorage.getItem('currentUser');
//     const shouldAllowCancel = isEditMode || !!storedUser;

//     setCanCancel(shouldAllowCancel);

//     if (!isEditMode && !initialData && storedUser) {
//       try {
//         const user = JSON.parse(storedUser);
//         logWithContext('JoinPartyModal.tsx', 'useEffect', `Parsed stored user: ${JSON.stringify(user)}`);

//         setUsername(user.name || '');
//         setSelectedAvatar(user.avatar || AVATARS[0]);
//         setSelectedStatus(user.game || STATUSES[0]);

//       } catch (e) {
//         Sentry.captureException(e);
//         console.error('Error parsing stored user:', e);
//       }
//     }
//   }, [isEditMode, initialData]);

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();

//     if (!username.trim()) {
//       setError('Username is required');
//       return;
//     }

//     setIsSubmitting(true);
//     setError('');
//     logWithContext('JoinPartyModal.tsx', 'handleSubmit', `Submitting data: { username: ${username}, avatar: ${selectedAvatar}, status: ${selectedStatus} }`);

//     const avatar = selectedAvatar || AVATARS[0];
//     const status = selectedStatus || STATUSES[0];

//     setTimeout(() => {
//       try {
//         onJoin(username.trim() || '', avatar || '', status || '');
//         logWithContext('JoinPartyModal.tsx', 'handleSubmit', 'Join successful');

//       } catch (error) {
//         Sentry.captureException(error);
//         console.error('Error during join:', error);
//         setError('Failed to join');

//       } finally {
//         setIsSubmitting(false);
//       }
//     }, 300);
//   };

//   const handleCancel = () => {
//     if (canCancel && onCancel) {
//       logWithContext('JoinPartyModal.tsx', 'handleCancel', 'Canceling action');
//       onCancel();
//     }
//   };

//   const modalTitle = useMemo(() => isEditMode ? 'Edit Profile' : 'Join Chat360 Party', [isEditMode]);
//   const buttonText = useMemo(() => isEditMode ? 'Save Changes' : 'Join Party', [isEditMode]);

//   return (
//     <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
//       <div className='bg-[#f0f0fa] w-full max-w-md p-6 shadow-lg'>
//         <div className='flex justify-between items-center mb-4'>
//           <h2 className='text-xl font-bold text-[#161718]'>{modalTitle}</h2>
//         </div>

//         <form onSubmit={handleSubmit} className='space-y-4'>
//           <div>
//             <label htmlFor='username' className='block text-sm font-medium text-[#161718] mb-1'>
//               Username
//             </label>
//             <Input
//               type='text'
//               id='username'
//               value={username}
//               onChange={(e) => setUsername(e.target.value)}
//               className={cn(
//                 'w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm',
//                 'focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83]',
//                 'text-black transition-colors',
//                 error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
//               )}
//               required
//               disabled={isSubmitting}
//             />
//             {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
//           </div>

//           <div>
//             <label className='block text-sm font-medium text-[#161718] mb-1'>Select Avatar</label>
//             <div className='grid grid-cols-5 gap-2'>
//               {AVATARS.map((avatar, index) => (
//                 <button
//                   key={index}
//                   type='button'
//                   onClick={() => setSelectedAvatar(avatar)}
//                   disabled={isSubmitting}
//                   className={`w-12 h-12 rounded-md overflow-hidden ${
//                     selectedAvatar === avatar ? 'ring-[3px] ring-[#55b611]' : ''
//                   }`}
//                 >
//                   <Image src={avatar} alt={`Avatar ${index + 1}`} width={48} height={48} />
//                 </button>
//               ))}
//             </div>
//           </div>

//           <div>
//             <label htmlFor='status' className='block text-sm font-medium text-[#161718] mb-1'>
//               Status
//             </label>
//             <Select
//               id='status'
//               value={selectedStatus}
//               onChange={(e) => setSelectedStatus(e.target.value)}
//               className={cn(
//                 'w-full px-3 py-2 border border-gray-300 rounded-none shadow-sm',
//                 'focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] text-black'
//               )}
//               disabled={isSubmitting}>
//               {STATUSES.map((status) => (
//                 <option key={status} value={status}>{status}</option>
//               ))}
//             </Select>
//           </div>

//           <div className='flex justify-between items-center'>
//             <Button
//               type='button'
//               onClick={handleCancel}
//               disabled={!canCancel || isSubmitting}
//               className={cn(
//                 'flex items-center gap-2 px-4 py-2 border-2 rounded-none transition-colors',
//                 canCancel ? 'border-[#ae1228] hover:bg-[#ae1228]' : 'border-gray-400 bg-transparent opacity-50 cursor-not-allowed'
//               )}
//             >
//               <div className={cn(
//                 'w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs',
//                 canCancel ? 'bg-[#ae1228]' : 'bg-gray-400'
//               )}>
//                 B
//               </div>
//               <span className={cn('text-[#161718]', canCancel && 'hover:text-white')}>Cancel</span>
//             </Button>

//             <Button
//               type='submit'
//               disabled={isSubmitting}
//               className='flex items-center gap-2 px-4 py-2 border-2 border-[#55b611] rounded-none transition-colors hover:bg-[#55b611]'>
//               <div className='w-6 h-6 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-xs'>
//                 A
//               </div>
//               <span className='text-[#161718] group-hover:text-white'>{isSubmitting ? 'Loading...' : buttonText}</span>
//             </Button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// });