import React from 'react';
import {
  Inbox,
  Tag,
  Users,
  Info,
  Star,
  Clock,
  Send,
  FileText,
  Archive,
  AlertOctagon,
  Trash2,
  Plus,
  Settings,
  HelpCircle,
  X,
  ShieldCheck,
  Sparkles,
  HardDrive,
  Code2,
  KeyRound,
  Phone
} from 'lucide-react';
import { MailFolder, UserProfile } from '../types';

interface GmailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentFolder: MailFolder | 'all_inboxes';
  onSelectFolder: (folder: MailFolder | 'all_inboxes') => void;
  unreadCounts: Record<string, number>;
  user: UserProfile | null;
  onOpenCompose: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenAdmin?: () => void;
  onOpenHeroPage?: (section?: 'hero' | 'terms' | 'privacy') => void;
  onOpenOAuthDev: () => void;
  darkMode: boolean;
  activeTab?: 'email' | 'phone';
  onOpenPhone?: () => void;
  onOpenEmail?: () => void;
}

export const GmailDrawer: React.FC<GmailDrawerProps> = ({
  isOpen,
  onClose,
  currentFolder,
  onSelectFolder,
  unreadCounts,
  user,
  onOpenCompose,
  onOpenSettings,
  onOpenHelp,
  onOpenAdmin,
  onOpenHeroPage,
  onOpenOAuthDev,
  darkMode,
  activeTab = 'email',
  onOpenPhone,
  onOpenEmail
}) => {
  if (!isOpen) return null;

  const handleItemClick = (folder: MailFolder | 'all_inboxes') => {
    if (onOpenEmail) onOpenEmail();
    onSelectFolder(folder);
    onClose();
  };

  const isSelected = (folder: string) => activeTab === 'email' && currentFolder === folder;

  const renderNavButton = (
    id: MailFolder | 'all_inboxes',
    label: string,
    Icon: React.ElementType,
    badgeCount?: number
  ) => {
    const active = isSelected(id);
    return (
      <button
        onClick={() => handleItemClick(id)}
        className={`w-full flex items-center justify-between px-5 py-2.5 text-left transition-all text-xs font-medium rounded-r-full ${
          active
            ? 'bg-[#FF6A00]/20 text-[#FF8C42] border-l-4 border-[#FF6A00] pl-4 font-bold shadow-sm'
            : 'text-zinc-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#FF6A00]' : 'text-zinc-400'}`} />
          <span className="truncate">{label}</span>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
            active ? 'bg-[#FF6A00] text-white' : 'bg-white/10 text-zinc-300'
          }`}>
            {badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      {/* Drawer Container */}
      <div className={`relative w-72 sm:w-80 max-w-[85vw] h-full shadow-2xl flex flex-col z-10 border-r backdrop-blur-xl ${
        darkMode ? 'bg-[#18191d]/95 border-white/10 text-white' : 'bg-white/95 border-orange-200 text-zinc-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-md text-sm">
              G
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] bg-clip-text text-transparent">
                GoldMailer
              </span>
              <span className="ml-1 text-[10px] text-zinc-400 font-mono">15GB</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compose Button */}
        <div className="px-4 py-2 space-y-2">
          <button
            type="button"
            onClick={() => {
              onOpenCompose();
              onClose();
            }}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow-lg shadow-[#FF6A00]/25 hover:shadow-[#FF6A00]/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Compose Email</span>
          </button>

          {onOpenPhone && (
            <button
              type="button"
              onClick={() => {
                onOpenPhone();
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'phone'
                  ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-md'
                  : 'bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Phone className={`w-4 h-4 ${activeTab === 'phone' ? 'text-white' : 'text-[#FF6A00]'}`} />
                <span>Phone & SMS Hub</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                Active
              </span>
            </button>
          )}
        </div>

        {/* Scrollable folder list */}
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 pr-2">
          {renderNavButton('primary', 'Primary', Inbox, unreadCounts.primary)}
          {renderNavButton('promotions', 'Promotions', Tag, unreadCounts.promotions)}
          {renderNavButton('social', 'Social', Users, unreadCounts.social)}
          {renderNavButton('updates', 'Updates', Info, unreadCounts.updates)}

          <div className="my-2 border-t border-white/10" />

          {renderNavButton('starred', 'Starred', Star, unreadCounts.starred)}
          {renderNavButton('sent', 'Sent', Send, unreadCounts.sent)}
          {renderNavButton('scheduled', 'Scheduled', Clock, unreadCounts.scheduled)}
          {renderNavButton('drafts', 'Drafts', FileText, unreadCounts.drafts)}
          {renderNavButton('all_mail', 'All Mail', Archive, unreadCounts.all_mail)}
          {renderNavButton('spam', 'Spam', AlertOctagon, unreadCounts.spam)}
          {renderNavButton('trash', 'Trash', Trash2, unreadCounts.trash)}

          <div className="my-2 border-t border-white/10" />

          {/* OAuth 2.0 Dev Portal Link */}
          <button
            onClick={() => {
              onOpenOAuthDev();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-xs text-[#FF8C42] hover:bg-[#FF6A00]/10 rounded-r-full font-bold transition-colors"
          >
            <Code2 className="w-4 h-4 text-[#FF8C42]" />
            <span>OAuth 2.0 Developer Portal</span>
          </button>

          {/* Admin link if user is admin */}
          {(user?.role === 'admin' || user?.email?.toLowerCase().includes('admin')) && (
            <button
              onClick={() => {
                if (onOpenAdmin) onOpenAdmin();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-xs text-amber-400 hover:bg-amber-500/10 rounded-r-full font-bold transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Panel (/admin)</span>
            </button>
          )}

          {/* Hero Landing Page Link */}
          <button
            onClick={() => {
              if (onOpenHeroPage) onOpenHeroPage('hero');
              onClose();
            }}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5 rounded-r-full transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#FF6A00]" />
            <span>Landing Page</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5 rounded-r-full transition-colors"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            <span>Security & Settings</span>
          </button>
        </div>

        {/* Footer: 15GB Cloud Storage Status Bar & 2FA Badge */}
        <div className="p-4 border-t border-white/10 space-y-2 bg-black/20 text-xs">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 font-semibold text-white">
              <HardDrive className="w-3.5 h-3.5 text-[#FF6A00]" /> 15 GB Storage
            </span>
            <span className="font-mono">0.42 GB (2.8%)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] rounded-full" style={{ width: '2.8%' }} />
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <KeyRound className="w-3 h-3" /> 2FA Security Ready
            </span>
            <span>goldmailer.xyz</span>
          </div>
        </div>
      </div>
    </div>
  );
};
