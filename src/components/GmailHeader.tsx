import React from 'react';
import { Menu, Search, X } from 'lucide-react';
import { UserProfile } from '../types';

interface GmailHeaderProps {
  onOpenDrawer: () => void;
  onOpenAccountSwitcher: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  user: UserProfile | null;
  activeEmail: string;
}

export const GmailHeader: React.FC<GmailHeaderProps> = ({
  onOpenDrawer,
  onOpenAccountSwitcher,
  searchQuery,
  onSearchChange,
  user,
  activeEmail
}) => {
  // Determine avatar representation
  const avatarLetter = (user?.name || activeEmail || 'G').charAt(0).toUpperCase();
  const avatarImage = user?.avatar_url || '';

  // Deterministic avatar color based on name/email
  const colors = [
    'bg-[#0b57d0]',
    'bg-[#ea4335]',
    'bg-[#fbbc04] text-zinc-900',
    'bg-[#34a853]',
    'bg-[#9333ea]',
    'bg-[#0284c7]',
    'bg-[#e11d48]'
  ];
  const charCode = (activeEmail || 'g').charCodeAt(0);
  const colorClass = colors[charCode % colors.length];

  return (
    <header className="sticky top-0 z-30 pt-3 pb-2 px-3 bg-[#121212]/95 backdrop-blur-md">
      {/* Gmail-style search bar container */}
      <div className="flex items-center h-12 bg-[#2d2f31] hover:bg-[#333538] transition-colors rounded-full px-3.5 shadow-sm border border-white/5 gap-3">
        {/* Left: Hamburger menu */}
        <button
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="p-1.5 -ml-1 text-[#e3e3e3] hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Center: Search input */}
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search in mail"
            className="w-full bg-transparent text-[#e3e3e3] placeholder-[#9aa0a6] text-[15px] outline-none font-normal"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="p-1 text-[#9aa0a6] hover:text-white rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right: User Avatar */}
        <button
          onClick={onOpenAccountSwitcher}
          aria-label="Account details"
          className="relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#8ab4f8] rounded-full p-0.5"
        >
          {avatarImage ? (
            <img
              src={avatarImage}
              alt={user?.name || 'Account'}
              className="w-8 h-8 rounded-full object-cover border border-white/10"
            />
          ) : (
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm text-white shadow-inner ${colorClass}`}
            >
              {avatarLetter}
            </div>
          )}
        </button>
      </div>
    </header>
  );
};
