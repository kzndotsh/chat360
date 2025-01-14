import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={`relative ${className}`}>
      <div className={`${sizeClasses[size]} animate-spin`}>
        <div className="absolute h-full w-full rounded-full border-4 border-solid border-gray-200"></div>
        <div className="absolute h-full w-full animate-spin rounded-full border-4 border-solid border-[#55b611] border-t-transparent"></div>
      </div>
    </div>
  );
};
