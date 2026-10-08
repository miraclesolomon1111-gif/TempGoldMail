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
  HardDrive,
  Code2,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { MailFolder, UserProfile } from '../types';

interface GmailSidebarProps {
  currentFolder: MailFolder | 'all_inboxes';
  onSelectFolder: (folder: MailFolder | 'all_inboxes') => void;
  unreadCounts: Record<string, number>;
  user: UserProfile | null;
  onOpenCompose: () => void;
  onOpenSettings: () => void;
  onOpenOAuthDev: () => void;
  onOpenAdmin?: () => void;
  darkMode: boolean;
  activeTab?: 'email' | 'phone';
  onOpenPhone?: () => void;
  onOpenEmail?: () => void;
}

export const GmailSidebar: React.FC<GmailSidebarProps> = ({
  currentFolder,
  onSelectFolder,
  unreadCounts,
  user,
  onOpenCompose,
  onOpenSettings,
  onOpenOAuthDev,
  onOpenAdmin,
  darkMode,
  activeTab = 'email',
  onOpenPhone,
  onOpenEmail
}) => {
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
        type="button"
        onClick={() => {
          if (onOpenEmail) onOpenEmail();
          onSelectFolder(id);
        }}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-all text-xs font-medium rounded-r-full mr-2 cursor-pointer ${
          active
            ? 'bg-[#FF6A00]/20 text-[#FF8C42] border-l-4 border-[#FF6A00] pl-3.5 font-bold shadow-sm'
            : darkMode
              ? 'text-zinc-300 hover:bg-white/5 hover:text-white'
              : 'text-zinc-700 hover:bg-orange-500/10 hover:text-zinc-900'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#FF6A00]' : darkMode ? 'text-zinc-400' : 'text-zinc-500'}`} />
          <span className="truncate">{label}</span>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              active
                ? 'bg-[#FF6A00] text-white'
                : darkMode
                  ? 'bg-white/10 text-zinc-300'
                  : 'bg-zinc-200 text-zinc-700'
            }`}
          >
            {badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`hidden lg:flex flex-col w-64 flex-shrink-0 border-r select-none transition-colors ${
        darkMode ? 'bg-[#151619] border-white/10 text-white' : 'bg-[#faf8f6] border-orange-200/60 text-zinc-900'
      }`}
    >
      {/* Large Gmail-Style Compose Button */}
      <div className="p-4 pb-2">
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-[#FF6A00]/25 hover:shadow-[#FF6A00]/40 transition-all flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Compose</span>
        </button>
      </div>

      {/* Phone & SMS Dedicated Navigation Button */}
      {onOpenPhone && (
        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={onOpenPhone}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'phone'
                ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-md shadow-[#FF6A00]/20'
                : darkMode
                  ? 'bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/5'
                  : 'bg-orange-50 text-orange-950 hover:bg-orange-100 border border-orange-200/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Phone className={`w-4 h-4 ${activeTab === 'phone' ? 'text-white' : 'text-[#FF6A00]'}`} />
              <span>Phone & SMS</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                activeTab === 'phone'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
              }`}
            >
              Active
            </span>
          </button>
        </div>
      )}

      {/* Navigation Folders List */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 pr-2">
        {renderNavButton('primary', 'Inbox', Inbox, unreadCounts.primary)}
        {renderNavButton('starred', 'Starred', Star, unreadCounts.starred)}
        {renderNavButton('scheduled', 'Scheduled', Clock, unreadCounts.scheduled)}
        {renderNavButton('sent', 'Sent', Send, unreadCounts.sent)}
        {renderNavButton('drafts', 'Drafts', FileText, unreadCounts.drafts)}

        <div className={`my-3 border-t ${darkMode ? 'border-white/10' : 'border-zinc-200'}`} />

        <div className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          Categories
        </div>
        {renderNavButton('social', 'Social', Users, unreadCounts.social)}
        {renderNavButton('updates', 'Updates', Info, unreadCounts.updates)}
        {renderNavButton('promotions', 'Promotions', Tag, unreadCounts.promotions)}

        <div className={`my-3 border-t ${darkMode ? 'border-white/10' : 'border-zinc-200'}`} />

        {renderNavButton('all_mail', 'All Mail', Archive, unreadCounts.all_mail)}
        {renderNavButton('spam', 'Spam', AlertOctagon, unreadCounts.spam)}
        {renderNavButton('trash', 'Trash', Trash2, unreadCounts.trash)}
      </div>

      {/* Bottom Storage & Utilities */}
      <div className={`p-4 border-t space-y-3 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
        {/* 15 GB Storage Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Storage</span>
            </span>
            <span>{(user?.storage_used_gb ?? 0).toFixed(2)} GB / {user?.storage_quota_gb || 15} GB</span>
          </div>
          <div className={`w-full h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-zinc-200'}`}>
            <div
              className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42]"
              style={{ width: `${Math.min(100, ((user?.storage_used_gb ?? 0) / (user?.storage_quota_gb || 15)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Shortcuts */}
        <div className="flex items-center justify-between pt-1 text-xs text-zinc-400">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 hover:text-[#FF8C42] transition-colors cursor-pointer"
            title="Account Security & 2FA"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Security</span>
          </button>
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer font-semibold"
              title="Open Admin Control Panel"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenOAuthDev}
            className="flex items-center gap-1.5 hover:text-[#FF8C42] transition-colors cursor-pointer"
            title="OAuth 2.0 Provider"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>OAuth Dev</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
