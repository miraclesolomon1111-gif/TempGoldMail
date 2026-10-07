import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Lock,
  Check,
  ShieldCheck,
  LogOut,
  HardDrive,
  Settings,
  Code2,
  Trash2,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  StoredAccount,
  getStoredAccounts,
  removeStoredAccount,
  getStoredActiveEmail
} from '../lib/api';

interface AccountSwitcherSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  user: UserProfile | null;
  onSwitchAccount: (email: string) => void;
  onOpenSettings: () => void;
  onOpenOAuthDev: () => void;
  onOpenHeroPage?: (section: 'hero' | 'terms' | 'privacy') => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onLogout: () => void;
  onLogoutAll?: () => void;
  darkMode: boolean;
}

export const AccountSwitcherSheet: React.FC<AccountSwitcherSheetProps> = ({
  isOpen,
  onClose,
  activeEmail,
  user,
  onSwitchAccount,
  onOpenSettings,
  onOpenOAuthDev,
  onOpenHeroPage,
  onOpenAuth,
  onLogout,
  onLogoutAll,
  darkMode
}) => {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);

  useEffect(() => {
    if (isOpen) {
      const list = getStoredAccounts();
      setAccounts(list);
    }
  }, [isOpen, activeEmail]);

  if (!isOpen) return null;

  const currentDisplayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || activeEmail.split('@')[0] || 'User';
  const currentInitial = currentDisplayName.charAt(0).toUpperCase();

  const handleRemoveAccount = (e: React.MouseEvent, emailToRemove: string) => {
    e.stopPropagation();
    removeStoredAccount(emailToRemove);
    const updated = getStoredAccounts();
    setAccounts(updated);
    if (updated.length === 0) {
      onLogout();
      onClose();
    } else if (emailToRemove.toLowerCase() === activeEmail.toLowerCase()) {
      onSwitchAccount(updated[0].email);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div
        className={`relative w-full max-w-md rounded-3xl shadow-2xl p-6 border overflow-hidden backdrop-blur-xl max-h-[92vh] flex flex-col ${
          darkMode
            ? 'bg-[#18191d]/95 border-[#FF6A00]/30 text-white'
            : 'bg-white/95 border-orange-200 text-zinc-900'
        }`}
      >
        {/* Glow */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-[#FF6A00]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]" />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              GoldMailer Multi-Account Manager
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Active Account Card (Google-style) */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FF6A00]/15 via-white/5 to-transparent border border-[#FF6A00]/30 relative overflow-hidden">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-extrabold text-2xl text-white shadow-lg shadow-[#FF6A00]/30 flex-shrink-0">
                {currentInitial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white truncate">{currentDisplayName}</h3>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FF6A00]/20 text-[#FF8C42] text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-300 truncate mt-0.5">{activeEmail}</p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400">
                  <HardDrive className="w-3 h-3 text-[#FF6A00]" />
                  <span>15 GB Cloud Quota Active</span>
                </div>
              </div>
            </div>

            {/* Storage Meter */}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                <span>Storage used</span>
                <span>0.42 GB of 15 GB (2.8%)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42]" style={{ width: '2.8%' }} />
              </div>
            </div>
          </div>

          {/* Other Accounts List */}
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Switch Accounts ({accounts.length})
              </span>
            </div>

            <div className="space-y-1.5">
              {accounts.map((acc) => {
                const isActive = acc.email.toLowerCase() === activeEmail.toLowerCase();
                const accInitial = (acc.name || acc.username || acc.email).charAt(0).toUpperCase();

                return (
                  <div
                    key={acc.email}
                    onClick={() => {
                      if (!isActive) {
                        onSwitchAccount(acc.email);
                        onClose();
                      }
                    }}
                    className={`group w-full flex items-center justify-between p-3 rounded-2xl transition-all border ${
                      isActive
                        ? 'bg-white/10 border-[#FF6A00]/40 cursor-default'
                        : 'bg-white/5 hover:bg-[#FF6A00]/10 border-white/5 hover:border-[#FF6A00]/20 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${
                          isActive
                            ? 'bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] shadow-sm'
                            : 'bg-white/10 group-hover:bg-[#FF6A00]/30'
                        }`}
                      >
                        {accInitial}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-bold text-white truncate">
                          {acc.name || acc.username}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 truncate">
                          {acc.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-2">
                      {isActive ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                          <Check className="w-3 h-3" />
                          <span>Active</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#FF8C42] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          Switch <ChevronRight className="w-3 h-3" />
                        </span>
                      )}

                      {accounts.length > 1 && (
                        <button
                          type="button"
                          title="Remove this account from switcher"
                          onClick={(e) => handleRemoveAccount(e, acc.email)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Another Account Button */}
          <button
            type="button"
            onClick={() => {
              onOpenAuth('login');
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-dashed border-white/15 hover:border-[#FF6A00]/40 text-xs font-semibold text-zinc-200 hover:text-white transition-all"
          >
            <UserPlus className="w-4 h-4 text-[#FF6A00]" />
            <span>Add another GoldMailer account</span>
          </button>

          {/* Quick Management Shortcuts */}
          <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4 text-[#FF6A00]" />
              <span className="font-medium">2-Step Verification & Security</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenOAuthDev();
                onClose();
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
            >
              <Code2 className="w-4 h-4 text-[#FF8C42]" />
              <span className="font-medium">OAuth 2.0 Developer Portal</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-white/10 flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/5 hover:border-red-500/30 text-zinc-300 hover:text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out of active account</span>
          </button>

          {accounts.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (onLogoutAll) {
                  onLogoutAll();
                } else {
                  localStorage.removeItem('goldmailer_multi_accounts');
                  onLogout();
                }
                onClose();
              }}
              className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-colors"
              title="Sign out of all accounts on this device"
            >
              Sign out all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
