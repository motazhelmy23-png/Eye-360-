import React from 'react';
import { COPYRIGHT_NOTICE } from '../constants/brand';

interface CopyrightNoticeProps {
  variant?: 'dark' | 'light' | 'muted';
  className?: string;
}

export function CopyrightNotice({ variant = 'muted', className = '' }: CopyrightNoticeProps) {
  const colorClass = 
    variant === 'dark' 
      ? 'text-[#667085]' 
      : variant === 'light' 
        ? 'text-slate-400' 
        : 'text-[#98A2B3]';

  return (
    <div 
      className={`text-[11px] tracking-normal select-none dir-ltr font-sans ${colorClass} ${className}`}
      dir="ltr"
    >
      {COPYRIGHT_NOTICE}
    </div>
  );
}

export default CopyrightNotice;
