import React from 'react';
import { BRAND_ASSETS } from '../assets/brand';

interface BrandLogoProps {
  variant?: 'light' | 'dark' | 'compact' | 'symbol';
  className?: string;
  onClick?: () => void;
}

export function BrandLogo({ variant = 'light', className = '', onClick }: BrandLogoProps) {
  let src = BRAND_ASSETS.logoLight;
  let defaultWidth = 'w-[220px] sm:w-[240px]'; // Enlarged for login top header

  if (variant === 'dark') {
    src = BRAND_ASSETS.logoDark;
    defaultWidth = 'w-[155px]'; // 145-165px for dark panel logo
  } else if (variant === 'compact') {
    src = BRAND_ASSETS.logoCompact;
    defaultWidth = 'w-[105px]';
  } else if (variant === 'symbol') {
    src = BRAND_ASSETS.symbol;
    defaultWidth = 'w-8 h-8'; // 32px (30-34px)
  }

  const hasWidthClass = className.includes('w-') || className.includes('max-w-');
  const widthClass = hasWidthClass ? '' : defaultWidth;

  return (
    <img
      src={src}
      alt="Eye 360"
      className={`h-auto object-contain cursor-pointer select-none ${widthClass} ${className}`}
      onClick={onClick}
      onError={(e) => {
        console.error('EYE360_LOGO_LOAD_FAILED', e.currentTarget.src);
      }}
      referrerPolicy="no-referrer"
    />
  );
}
