import React from 'react';

interface BlockOpsLogoProps {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
  theme?: 'dark' | 'light';
}

export const BlockOpsLogo: React.FC<BlockOpsLogoProps> = ({
  size = 38,
  showWordmark = true,
  subtitle = 'Loyalty',
  theme = 'dark',
}) => {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_6px_14px_rgba(11,75,227,0.35)]"
      >
        <path d="M32 6L56 19.5L32 33L8 19.5L32 6Z" fill="#0EA5E9" />
        <path d="M8 19.5L32 33V58L8 44.5V19.5Z" fill="#0B4BE3" />
        <path d="M56 19.5L32 33V58L56 44.5V19.5Z" fill="url(#blockops_amber)" />
        <path
          d="M32 22L43 28.2V40.8L32 47L21 40.8V28.2L32 22Z"
          fill="#090D16"
          fillOpacity="0.22"
        />
        <path d="M32 20L42 25.6L32 31.2L22 25.6L32 20Z" fill="#FFFFFF" fillOpacity="0.92" />
        <path d="M22 25.6L32 31.2V42.4L22 36.8V25.6Z" fill="#FFFFFF" fillOpacity="0.72" />
        <defs>
          <linearGradient id="blockops_amber" x1="32" y1="19.5" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF7A00" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>

      {showWordmark && (
        <div className="leading-tight">
          <div className="flex items-baseline gap-0.5">
            <span
              className={`font-display text-lg font-extrabold tracking-tight ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            >
              Block
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-[#0EA5E9]">
              Ops
            </span>
          </div>
          {subtitle && (
            <div
              className={`text-[11px] font-medium tracking-wider uppercase ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const PoweredByBlockOps: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div
    className={`inline-flex items-center gap-2 text-xs font-medium ${
      dark ? 'text-slate-400' : 'text-slate-500'
    }`}
  >
    <BlockOpsLogo size={18} showWordmark={false} />
    <span>
      Powered by <strong className={dark ? 'text-white' : 'text-slate-800'}>BlockOps Loyalty</strong>
    </span>
  </div>
);

