import React from 'react';
import {
  Inbox,
  Tag,
  Users,
  Info,
  Star,
  Clock,
  Bookmark,
  Send,
  FileText,
  Archive,
  AlertOctagon,
  Trash2,
  MailCheck,
  Plus,
  Calendar,
  Settings,
  HelpCircle,
  Layers,
  X,
  UploadCloud,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { MailFolder, UserProfile } from '../types';

interface GmailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentFolder: MailFolder | 'all_inboxes';
  onSelectFolder: (folder: MailFolder | 'all_inboxes') => void;
  unreadCounts: Record<string, number>;
  user: UserProfile | null;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenCreateLabel: () => void;
  onOpenAdmin?: () => void;
  onOpenHeroPage?: (section?: 'hero' | 'terms' | 'privacy') => void;
}

export const GmailDrawer: React.FC<GmailDrawerProps> = ({
  isOpen,
  onClose,
  currentFolder,
  onSelectFolder,
  unreadCounts,
  user,
  onOpenSettings,
  onOpenHelp,
  onOpenCreateLabel,
  onOpenAdmin,
  onOpenHeroPage
}) => {
  if (!isOpen) return null;

  const handleItemClick = (folder: MailFolder | 'all_inboxes') => {
    onSelectFolder(folder);
    onClose();
  };

  const isSelected = (folder: string) => currentFolder === folder;

  const renderNavButton = (
    id: MailFolder | 'all_inboxes',
    label: string,
    Icon: React.ElementType,
    badgeCount?: number,
    pillBadge?: string
  ) => {
    const active = isSelected(id);
    return (
      <button
        onClick={() => handleItemClick(id)}
        className={`w-full flex items-center justify-between px-6 py-3 text-left transition-colors text-[14px] font-normal ${
          active
            ? 'bg-[#333d4d] text-[#c2e7ff] font-medium rounded-r-full -ml-2 pl-8'
            : 'text-[#e3e3e3] hover:bg-white/5 rounded-r-full'
        }`}
      >
        <div className="flex items-center gap-4.5 min-w-0">
          <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-[#c2e7ff]' : 'text-[#c4c7c5]'}`} />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {pillBadge && (
            <span className="bg-[#0b57d0] text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
              {pillBadge}
            </span>
          )}
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className={`text-[12px] font-medium ${active ? 'text-[#c2e7ff]' : 'text-[#c4c7c5]'}`}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Content */}
      <div className="relative w-72 sm:w-80 max-w-[85vw] h-full bg-[#1e1f20] text-[#e3e3e3] shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250 ease-out border-r border-[#303134]">
        {/* Drawer Header (Screenshot 1: "GoldMail") */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-medium tracking-tight text-white flex items-center gap-1.5 font-sans">
              <span className="text-[#fbbc04] font-bold">Gold</span>
              <span>Mail</span>
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
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 pr-3 scrollbar-thin scrollbar-thumb-zinc-700">
          {/* All inboxes */}
          {renderNavButton('all_inboxes', 'All inboxes', Layers, unreadCounts.total)}

          <div className="my-2 border-t border-[#303134]" />

          {/* Primary & Main Categories */}
          {renderNavButton('primary', 'Primary', Inbox, unreadCounts.primary)}
          {renderNavButton('promotions', 'Promotions', Tag, unreadCounts.promotions)}
          {renderNavButton('social', 'Social', Users, unreadCounts.social)}
          {renderNavButton('updates', 'Updates', Info, unreadCounts.updates)}

          {/* All Labels Section */}
          <div className="pt-3 pb-1 px-6">
            <p className="text-[12px] font-semibold text-[#8e918f] tracking-wide">All labels</p>
          </div>

          {renderNavButton('starred', 'Starred', Star)}
          {renderNavButton('snoozed', 'Snoozed', Clock)}
          {renderNavButton('important', 'Important', Bookmark)}
          {renderNavButton('sent', 'Sent', Send, unreadCounts.sent)}
          {renderNavButton('scheduled', 'Scheduled', Clock, unreadCounts.scheduled)}
          {renderNavButton('outbox', 'Outbox', UploadCloud, unreadCounts.outbox)}
          {renderNavButton('drafts', 'Drafts', FileText, unreadCounts.drafts)}
          {renderNavButton('all_mail', 'All mail', Archive, unreadCounts.all_mail)}
          {renderNavButton('spam', 'Spam', AlertOctagon, unreadCounts.spam)}
          {renderNavButton('trash', 'Trash', Trash2, unreadCounts.trash)}

          {/* Manage subscriptions & Create label (Screenshot 2) */}
          <div className="pt-2">
            {renderNavButton('manage_subscriptions', 'Manage subscriptions', MailCheck, undefined, 'New')}

            <button
              onClick={() => {
                onOpenCreateLabel();
                onClose();
              }}
              className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#e3e3e3] hover:bg-white/5 rounded-r-full transition-colors"
            >
              <Plus className="w-5 h-5 text-[#c4c7c5]" />
              <span>Create label</span>
            </button>
          </div>

          {/* GoldMail Apps Section */}
          <div className="pt-4 pb-1 px-6">
            <p className="text-[12px] font-semibold text-[#8e918f] tracking-wide">GoldMail apps</p>
          </div>

          <button
            onClick={() => {
              window.open('https://calendar.google.com', '_blank');
              onClose();
            }}
            className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#e3e3e3] hover:bg-white/5 rounded-r-full transition-colors"
          >
            <Calendar className="w-5 h-5 text-[#c4c7c5]" />
            <span>Calendar</span>
          </button>

          {/* Admin link if user is admin */}
          {(user?.role === 'admin' || user?.email?.includes('admin') || user?.email === 'mariampeter0312@gmail.com') && (
            <button
              onClick={() => {
                if (onOpenAdmin) onOpenAdmin();
                onClose();
              }}
              className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#fbbc04] hover:bg-white/5 rounded-r-full transition-colors"
            >
              <ShieldCheck className="w-5 h-5 text-[#fbbc04]" />
              <span className="font-medium">Admin Control Panel</span>
            </button>
          )}

          <div className="my-2 border-t border-[#303134]" />

          {/* GoldMail Hero / Landing Page Link */}
          <button
            onClick={() => {
              if (onOpenHeroPage) onOpenHeroPage('hero');
              onClose();
            }}
            className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#00C07F] hover:bg-white/5 rounded-r-full transition-colors"
          >
            <Sparkles className="w-5 h-5 text-[#00C07F]" />
            <span className="font-semibold">GoldMail Hero & Landing Page</span>
          </button>

          {/* Settings & Help */}
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#e3e3e3] hover:bg-white/5 rounded-r-full transition-colors"
          >
            <Settings className="w-5 h-5 text-[#c4c7c5]" />
            <span>Settings</span>
          </button>

          <button
            onClick={() => {
              onOpenHelp();
              onClose();
            }}
            className="w-full flex items-center gap-4.5 px-6 py-3 text-left text-[14px] text-[#e3e3e3] hover:bg-white/5 rounded-r-full transition-colors"
          >
            <HelpCircle className="w-5 h-5 text-[#c4c7c5]" />
            <span>Help & feedback</span>
          </button>
        </div>
      </div>
    </div>
  );
};
