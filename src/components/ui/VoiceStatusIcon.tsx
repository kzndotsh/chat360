import { cn } from '@/lib/utils/utils';

export type VoiceStatus = 'muted' | 'speaking' | 'silent' | 'deafened';

interface VoiceStatusIconProps {
  status: VoiceStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VoiceStatusIcon({ status, size = 'md', className }: VoiceStatusIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      {/* Base microphone icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          'absolute inset-0',
          status === 'muted' && 'text-red-500',
          status === 'speaking' && 'text-green-500',
          status === 'silent' && 'text-gray-500',
          status === 'deafened' && 'text-red-500'
        )}
      >
        <path
          d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19 10v2a7 7 0 0 1-14 0v-2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            status === 'speaking' && 'opacity-100',
            status !== 'speaking' && 'opacity-0'
          )}
        />
        {/* Speaking waves */}
        {status === 'speaking' && (
          <>
            <path
              d="M8 16c0-2.2 1.8-4 4-4s4 1.8 4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-pulse"
            />
            <path
              d="M6 14c0-3.3 2.7-6 6-6s6 2.7 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-pulse delay-75"
            />
            <path
              d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-pulse delay-150"
            />
          </>
        )}
        {/* Muted or deafened line */}
        {(status === 'muted' || status === 'deafened') && (
          <line
            x1="3"
            y1="3"
            x2="21"
            y2="21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}
