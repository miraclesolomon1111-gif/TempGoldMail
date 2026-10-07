import React, { useRef } from 'react';
import {
  X,
  Camera,
  UserPlus,
  Users,
  Sparkles,
  Cloud,
  Trash2,
  Lock,
  Check,
  ShieldAlert,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { TempEmail, UserProfile, StorageStats } from '../types';

interface AccountSwitcherSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  createdEmails: TempEmail[];
  user: UserProfile | null;
  storageStats: StorageStats;
  onSelectEmail: (email: string) => void;
  onOpenAddAccount: () => void;
  onOpenProfile: () => void;
  onOpenPremium: () => void;
  onDeleteCustomEmail: (id: string, email: string) => void;
  onCleanStorage: () => void;
  onUpdateAvatar: (base64OrUrl: string) => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  onOpenHeroPage?: (section: 'hero' | 'terms' | 'privacy') => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const AccountSwitcherSheet: React.FC<AccountSwitcherSheetProps> = ({
  isOpen,
  onClose,
  activeEmail,
  createdEmails,
  user,
  storageStats,
  onSelectEmail,
  onOpenAddAccount,
  onOpenProfile,
  onOpenPremium,
  onDeleteCustomEmail,
  onCleanStorage,
  onUpdateAvatar,
  onOpenPrivacy,
  onOpenTerms,
  onOpenHeroPage,
  onOpenAuth,
  onLogout
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onUpdateAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getAvatarColor = (str: string) => {
    const colors = [
      'bg-[#0b57d0]',
      'bg-[#ea4335]',
      'bg-[#e37400]',
      'bg-[#34a853]',
      'bg-[#9333ea]',
      'bg-[#0284c7]',
      'bg-[#475569]'
    ];
    const code = (str || 'a').charCodeAt(0);
    return colors[code % colors.length];
  };

  const otherEmails = createdEmails.filter(
    (e) => e.email_address.toLowerCase() !== activeEmail.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Sheet Modal Container (matching screenshots 4 & 5) */}
      <div className="relative w-full max-w-md max-h-[92vh] bg-[#1e1f20] text-[#e3e3e3] rounded-[28px] shadow-2xl flex flex-col z-10 overflow-hidden border border-[#303134] animate-in zoom-in-95 duration-200">
        {/* Top Header with Close X */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#8e918f] tracking-wide">
              {user ? user.email : 'Guest Session'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#c4c7c5] hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 scrollbar-thin scrollbar-thumb-zinc-700">
          {/* Active Account Card */}
          <div className="flex flex-col items-center pt-2 pb-3">
            <div className="relative group">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || 'User'}
                  className="w-18 h-18 rounded-full object-cover border-2 border-[#8ab4f8]"
                />
              ) : (
                <div
                  className={`w-18 h-18 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md ${getAvatarColor(
                    user?.name || activeEmail || 'U'
                  )}`}
                >
                  {(user?.name || activeEmail || 'G').charAt(0).toUpperCase()}
                </div>
              )}
              {/* Camera / Edit button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Change profile picture"
                className="absolute bottom-0 right-0 p-1.5 bg-[#2d2f31] hover:bg-[#3c4043] text-white rounded-full border border-[#5f6368] shadow transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <h3 className="mt-3 text-base font-medium text-white text-center">
              {user?.name || 'GoldMail User'}
            </h3>
            <p className="text-xs text-[#c4c7c5] text-center font-mono mt-0.5 max-w-full truncate px-2">
              {activeEmail || 'No active address created'}
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="px-5 py-2 rounded-full border border-[#5f6368] hover:border-[#8ab4f8] text-[13px] font-medium text-[#8ab4f8] hover:bg-white/5 transition-colors"
              >
                Manage your GoldMail Account
              </button>
            </div>
          </div>

          {/* List of other custom addresses */}
          {otherEmails.length > 0 && (
            <div className="space-y-1 border-t border-[#303134] pt-3">
              <p className="text-[11px] font-semibold text-[#8e918f] uppercase tracking-wider px-2 mb-2">
                Your Other GoldMail Addresses ({otherEmails.length})
              </p>
              {otherEmails.map((item) => {
                const letter = item.email_address.charAt(0).toUpperCase();
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5 transition-colors group cursor-pointer"
                    onClick={() => {
                      onSelectEmail(item.email_address);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.avatar_url ? (
                        <img
                          src={item.avatar_url}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${getAvatarColor(
                            item.email_address
                          )}`}
                        >
                          {letter}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-white truncate font-mono">
                            {item.email_address}
                          </p>
                          {item.is_password_protected && (
                            <Lock className="w-3 h-3 text-[#fbbc04] flex-shrink-0" />
                          )}
                          {item.is_reserved && (
                            <span className="text-[9px] bg-amber-500/20 text-[#fbbc04] px-1.5 py-0.2 rounded font-semibold">
                              PRO
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#8e918f]">
                          {item.message_count || 0} messages
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete address ${item.email_address}?`)) {
                          onDeleteCustomEmail(item.id, item.email_address);
                        }
                      }}
                      title="Delete this custom email"
                      className="p-1.5 text-zinc-500 hover:text-red-400 opacity-60 group-hover:opacity-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action options (Screenshots 4 & 5) */}
          <div className="space-y-1 border-t border-[#303134] pt-3">
            <button
              onClick={() => {
                onClose();
                onOpenAddAccount();
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 text-left text-[14px] text-white hover:bg-white/5 rounded-xl transition-colors font-medium"
            >
              <UserPlus className="w-5 h-5 text-[#c4c7c5]" />
              <span>+ Add another account</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 text-left text-[14px] text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <Users className="w-5 h-5 text-[#c4c7c5]" />
              <span>Manage accounts on this device</span>
            </button>

            {/* Premium plan / Reserve Email button */}
            <button
              onClick={() => {
                onClose();
                onOpenPremium();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left text-[14px] text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <Sparkles className="w-5 h-5 text-[#fbbc04]" />
                <span className="font-medium text-[#fbbc04]">
                  Reserve Email Forever ($1.11 / yr)
                </span>
              </div>
              <span className="text-[11px] bg-amber-500/20 text-[#fbbc04] font-medium px-2 py-0.5 rounded-full">
                Crypto Pay
              </span>
            </button>
          </div>

          {/* Storage Card (Screenshot 5: 48% of 15 GB used) */}
          <div className="bg-[#121212] border border-[#303134] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-medium text-[13px]">
                <Cloud className="w-4 h-4 text-[#8ab4f8]" />
                <span>{storageStats.used_percentage}% of {storageStats.formatted_total} used</span>
              </div>
              <span className="text-[12px] text-[#8e918f] font-mono">
                {storageStats.formatted_used}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-[#3c4043] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#8ab4f8] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, storageStats.used_percentage))}%` }}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1 text-[13px] font-medium">
              <button
                onClick={() => {
                  onClose();
                  onOpenPremium();
                }}
                className="text-[#8ab4f8] hover:underline"
              >
                Get storage
              </button>
              <button
                onClick={onCleanStorage}
                className="text-[#8ab4f8] hover:underline"
              >
                Clean up space
              </button>
            </div>
          </div>

          {/* Login / Logout status */}
          <div className="flex items-center justify-between pt-1 px-1">
            {user ? (
              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="text-xs text-red-400 hover:underline"
              >
                Sign out of account
              </button>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="text-xs text-[#8ab4f8] hover:underline font-medium"
              >
                Sign in to save emails across devices
              </button>
            )}
          </div>

          {/* Footer legal & hero links */}
          <div className="pt-2 pb-1 border-t border-[#303134] flex flex-wrap items-center justify-center gap-3 text-[11px] text-[#8e918f]">
            <button
              onClick={() => {
                onClose();
                if (onOpenHeroPage) onOpenHeroPage('hero');
              }}
              className="hover:text-[#00C07F] text-[#00C07F] font-semibold transition-colors"
            >
              About & Features
            </button>
            <span>•</span>
            <button
              onClick={() => {
                onClose();
                if (onOpenHeroPage) {
                  onOpenHeroPage('privacy');
                } else {
                  onOpenPrivacy();
                }
              }}
              className="hover:text-white transition-colors"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              onClick={() => {
                onClose();
                if (onOpenHeroPage) {
                  onOpenHeroPage('terms');
                } else {
                  onOpenTerms();
                }
              }}
              className="hover:text-white transition-colors"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
