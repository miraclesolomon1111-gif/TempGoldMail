import React from 'react';
import {
  X,
  UserPlus,
  Sparkles,
  Lock,
  Check,
  ShieldCheck,
  LogOut,
  HardDrive,
  Settings,
  Code2
} from 'lucide-react';
import { UserProfile } from '../types';

interface AccountSwitcherSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  user: UserProfile | null;
  onOpenSettings: () => void;
  onOpenOAuthDev: () => void;
  onOpenHeroPage?: (section: 'hero' | 'terms' | 'privacy') => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onLogout: () => void;
  darkMode: boolean;
}

export const AccountSwitcherSheet: React.FC<AccountSwitcherSheetProps> = ({
  isOpen,
  onClose,
  activeEmail,
  user,
  onOpenSettings,
  onOpenOAuthDev,
  onOpenHeroPage,
  onOpenAuth,
  onLogout,
  darkMode
}) => {
  if (!isOpen) return null;

  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username || 'Miracle';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className={`relative w-full max-w-sm rounded-3xl shadow-2xl p-6 border overflow-hidden backdrop-blur-xl ${
        darkMode ? 'bg-[#18191d]/95 border-[#FF6A00]/30 text-white' : 'bg-white/95 border-orange-200 text-zinc-900'
      }`}>
        {/* Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#FF6A00]/20 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">GoldMailer Account</span>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="mt-4 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-extrabold text-2xl text-white shadow-lg shadow-[#FF6A00]/30">
            {initial}
          </div>

          <div>
            <h3 className="text-base font-bold text-white">{displayName}</h3>
            <p className="text-xs font-mono text-[#FF8C42] mt-0.5">{activeEmail}</p>
          </div>

          {/* 15GB Cloud Quota Box */}
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl text-left space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[11px] text-zinc-300">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <HardDrive className="w-3.5 h-3.5 text-[#FF6A00]" /> Storage (15 GB)
              </span>
              <span className="font-mono text-zinc-400">0.42 GB (2.8%)</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42]" style={{ width: '2.8%' }} />
            </div>
          </div>
        </div>

        {/* Quick Account Navigation */}
        <div className="mt-5 space-y-1.5 text-xs">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4 text-[#FF6A00]" />
            <span className="font-medium">Manage 2-Step Verification & Security</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenOAuthDev();
              onClose();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
          >
            <Code2 className="w-4 h-4 text-[#FF8C42]" />
            <span className="font-medium">OAuth 2.0 Developer Portal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenAuth('register');
              onClose();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">Create another GoldMailer account</span>
          </button>
        </div>

        {/* Logout */}
        <div className="mt-5 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/5 hover:border-red-500/30 text-zinc-300 hover:text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out of GoldMailer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
