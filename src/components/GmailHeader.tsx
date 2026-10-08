import React from 'react';
import { Menu, Search, X, RefreshCw, Sun, Moon, ShieldCheck, Code2, Bell } from 'lucide-react';
import { UserProfile } from '../types';

interface GmailHeaderProps {
  onOpenDrawer: () => void;
  onOpenAccountSwitcher: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  user: UserProfile | null;
  activeEmail: string;
  isSyncing: boolean;
  onSyncEmails: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenOAuthDev: () => void;
  onOpenAdmin?: () => void;
  notifPermission?: string;
  onToggleNotifications?: () => void;
}

export const GmailHeader: React.FC<GmailHeaderProps> = ({
  onOpenDrawer,
  onOpenAccountSwitcher,
  searchQuery,
  onSearchChange,
  user,
  activeEmail,
  isSyncing,
  onSyncEmails,
  darkMode,
  onToggleDarkMode,
  onOpenOAuthDev,
  onOpenAdmin,
  notifPermission,
  onToggleNotifications
}) => {
  const avatarLetter = (user?.first_name || user?.name || activeEmail || 'M').charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 pt-3 pb-2 px-3 sm:px-4">
      {/* Search and Navigation Bar with Glassmorphism Orange style */}
      <div className={`flex items-center h-12 rounded-2xl sm:rounded-full px-3.5 shadow-sm border transition-colors gap-2.5 sm:gap-3 backdrop-blur-xl ${
        darkMode
          ? 'bg-[#1e1f24]/90 hover:bg-[#25262c]/95 border-white/10 text-white'
          : 'bg-white/85 hover:bg-white/95 border-orange-200 text-zinc-900 shadow-orange-500/5'
      }`}>
        {/* Left: Hamburger Menu */}
        <button
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="p-1.5 -ml-1 text-zinc-400 hover:text-[#FF6A00] rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Center: Search input */}
        <div className="flex-1 flex items-center min-w-0">
          <Search className="w-4 h-4 text-zinc-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search in mail"
            className="w-full bg-transparent text-sm placeholder-zinc-500 outline-none font-normal"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="p-1 text-zinc-400 hover:text-white rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sync Emails (Old & New) Button */}
        <button
          type="button"
          onClick={onSyncEmails}
          disabled={isSyncing}
          title="Sync emails (old & new messages)"
          className="p-2 rounded-xl text-zinc-400 hover:text-[#FF6A00] hover:bg-white/10 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#FF6A00]' : ''}`} />
          <span className="hidden md:inline text-xs font-semibold">Sync</span>
        </button>

        {/* Push Notification Toggle / Quick Action */}
        {onToggleNotifications && (
          <button
            type="button"
            onClick={onToggleNotifications}
            title={notifPermission === 'granted' ? 'Push Notifications Active (Click to test)' : 'Enable Push Notifications'}
            className={`p-2 rounded-xl transition-colors relative cursor-pointer ${
              notifPermission === 'granted'
                ? 'text-[#FF8C42] hover:bg-orange-500/15'
                : 'text-zinc-400 hover:text-amber-400 hover:bg-white/10'
            }`}
          >
            <Bell className="w-4 h-4" />
            {notifPermission === 'granted' && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#1e1f24]" />
            )}
          </button>
        )}

        {/* Dark/Light mode toggle */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-xl text-zinc-400 hover:text-[#FF8C42] hover:bg-white/10 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Admin Panel Quick Action (Mobile & Desktop) */}
        {onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            title="Admin Control Panel"
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all flex-shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {/* OAuth 2.0 Dev Portal Quick Action */}
        <button
          type="button"
          onClick={onOpenOAuthDev}
          title="OAuth 2.0 Provider Developer Portal"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FF6A00]/15 hover:bg-[#FF6A00]/25 text-[#FF8C42] border border-[#FF6A00]/30 text-xs font-bold transition-all"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>OAuth</span>
        </button>

        {/* Active User Email Pill (from screenshot) */}
        <button
          onClick={onOpenAccountSwitcher}
          aria-label="Account details"
          className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-[#FF6A00]/30 transition-all focus:outline-none"
        >
          <span className="hidden lg:inline text-xs font-mono font-medium text-[#FF8C42] truncate max-w-[160px]">
            {activeEmail}
          </span>
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-xs text-white shadow-inner flex-shrink-0">
            {avatarLetter}
          </div>
        </button>
      </div>
    </header>
  );
};
