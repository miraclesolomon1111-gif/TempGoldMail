import React from 'react';

interface GmLogoProps {
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
  textColor?: string;
  badge?: boolean;
}

export const GmLogo: React.FC<GmLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
  textColor = 'text-white',
  badge = true
}) => {
  const sizeMap: Record<string, { px: number; textClass: string }> = {
    xs: { px: 22, textClass: 'text-xs' },
    sm: { px: 28, textClass: 'text-sm' },
    md: { px: 36, textClass: 'text-base' },
    lg: { px: 44, textClass: 'text-lg' },
    xl: { px: 56, textClass: 'text-xl' }
  };

  const currentSize = typeof size === 'number' 
    ? { px: size, textClass: 'text-base' }
    : (sizeMap[size] || sizeMap.md);

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* GM Icon Graphic */}
      <div 
        className={`relative flex items-center justify-center flex-shrink-0 overflow-hidden ${
          badge 
            ? 'rounded-2xl bg-gradient-to-br from-[#1e222b] via-[#14161d] to-[#0c0e12] border border-[#FF8C42]/30 shadow-md shadow-orange-950/20' 
            : ''
        }`}
        style={{ width: currentSize.px, height: currentSize.px }}
      >
        <img 
          src="/favicon.png" 
          alt="GM Logo" 
          className="w-full h-full object-cover rounded-inherit transition-transform duration-200 hover:scale-105"
          onError={(e) => {
            // Fallback to SVG if PNG fails to load in specific context
            const target = e.currentTarget;
            if (!target.src.endsWith('/favicon.svg')) {
              target.src = '/favicon.svg';
            }
          }}
        />
      </div>

      {/* Optional GoldMailer Brand Text */}
      {showText && (
        <div className="flex items-center">
          <span className={`font-extrabold tracking-tight bg-gradient-to-r from-[#FF6A00] via-[#FFA149] to-[#FF8C42] bg-clip-text text-transparent ${currentSize.textClass}`}>
            GoldMailer
          </span>
          <span className="ml-1 text-[10px] text-zinc-400 font-mono">.xyz</span>
        </div>
      )}
    </div>
  );
};
