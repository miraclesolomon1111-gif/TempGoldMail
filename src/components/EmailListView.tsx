import React from 'react';
import {
  Star,
  Pencil,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Sparkles,
  Inbox,
  Send,
  Trash2,
  Clock,
  ShieldCheck,
  QrCode
} from 'lucide-react';
import { EmailMessage, MailFolder } from '../types';

interface EmailListViewProps {
  currentFolder: MailFolder | 'all_inboxes';
  emails: EmailMessage[];
  activeEmail: string;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectEmail: (email: EmailMessage) => void;
  onToggleStar: (emailId: string, currentStarred: boolean, e: React.MouseEvent) => void;
  onOpenCompose: () => void;
  onOpenCreateModal: () => void;
  onGenerateQuick: () => void;
  isCopied: boolean;
  onCopyEmail: () => void;
  totalUnreadCount: number;
}

export const EmailListView: React.FC<EmailListViewProps> = ({
  currentFolder,
  emails,
  activeEmail,
  isLoading,
  isRefreshing,
  onRefresh,
  onSelectEmail,
  onToggleStar,
  onOpenCompose,
  onOpenCreateModal,
  onGenerateQuick,
  isCopied,
  onCopyEmail,
  totalUnreadCount
}) => {
  // Format timestamp like Gmail (e.g., 9:14 AM or Oct 6)
  const formatGmailTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      if (isToday) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Sender avatar color
  const getAvatarColor = (str: string) => {
    const colors = [
      'bg-[#0b57d0]',
      'bg-[#c5221f]',
      'bg-[#e37400]',
      'bg-[#137333]',
      'bg-[#9333ea]',
      'bg-[#0284c7]',
      'bg-[#475569]'
    ];
    const code = (str || 'a').charCodeAt(0);
    return colors[code % colors.length];
  };

  const getFolderTitle = () => {
    switch (currentFolder) {
      case 'all_inboxes':
        return 'All inboxes';
      case 'primary':
        return 'Primary';
      case 'promotions':
        return 'Promotions';
      case 'social':
        return 'Social';
      case 'updates':
        return 'Updates';
      case 'starred':
        return 'Starred';
      case 'snoozed':
        return 'Snoozed';
      case 'important':
        return 'Important';
      case 'sent':
        return 'Sent';
      case 'scheduled':
        return 'Scheduled';
      case 'outbox':
        return 'Outbox';
      case 'drafts':
        return 'Drafts';
      case 'all_mail':
        return 'All mail';
      case 'spam':
        return 'Spam';
      case 'trash':
        return 'Trash';
      case 'manage_subscriptions':
        return 'Subscriptions';
      default:
        return 'Inbox';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-[#121212]">
      {/* Category / Folder Header */}
      <div className="px-5 pt-1 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9aa0a6]">
            {getFolderTitle()}
          </span>
          {emails.length > 0 && (
            <span className="text-[11px] text-[#5f6368] font-mono">({emails.length})</span>
          )}
        </div>

        {/* Quick active email info pill & refresh */}
        {activeEmail && (
          <div className="flex items-center gap-2">
            <button
              onClick={onCopyEmail}
              title="Copy active email"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#2d2f31] border border-white/5 text-[11px] font-mono text-[#8ab4f8] transition-colors"
            >
              {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span className="max-w-[150px] truncate">{activeEmail}</span>
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh inbox"
              className="p-1.5 text-[#9aa0a6] hover:text-white rounded-full hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#8ab4f8]' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-24 scrollbar-thin scrollbar-thumb-zinc-800">
        {/* If user hasn't generated or chosen an address yet (Zero state requested) */}
        {!activeEmail ? (
          <div className="max-w-md mx-auto my-12 px-6 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-[#1e1f20] border border-white/10 flex items-center justify-center text-[#fbbc04]">
              <Mail className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-white mb-2">Welcome to GoldMail</h2>
              <p className="text-sm text-[#9aa0a6] leading-relaxed">
                A clean, secure, disposable email platform. No shared public inboxes — generate an
                instant address or create your own custom handle to start receiving emails.
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <button
                onClick={onGenerateQuick}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg transition-colors"
              >
                <Sparkles className="w-4 h-4 text-[#fbbc04]" />
                <span>Generate Instant Disposable Email</span>
              </button>
              <button
                onClick={onOpenCreateModal}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#1e1f20] hover:bg-[#2d2f31] border border-[#303134] text-[#c2e7ff] font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Custom @goldmailer.xyz</span>
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RefreshCw className="w-7 h-7 text-[#8ab4f8] animate-spin" />
            <p className="text-xs text-[#9aa0a6]">Loading messages...</p>
          </div>
        ) : emails.length === 0 ? (
          /* Empty Folder View */
          <div className="max-w-md mx-auto my-16 px-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#1e1f20] flex items-center justify-center text-[#5f6368]">
              <Inbox className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-medium text-white">Nothing in {getFolderTitle()}</h3>
              <p className="text-xs text-[#9aa0a6] mt-1">
                Your messages will appear here in real time as they arrive.
              </p>
            </div>
            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                onClick={onRefresh}
                className="px-4 py-2 rounded-full bg-[#1e1f20] hover:bg-[#2d2f31] text-xs font-medium text-[#8ab4f8] border border-white/5 flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Check for new mail</span>
              </button>
            </div>
          </div>
        ) : (
          /* Gmail Email List (Screenshot 3 style) */
          <div className="divide-y divide-[#1e1f20]/60">
            {emails.map((msg) => {
              const senderDisplayName = msg.sender_name || msg.sender.split('@')[0] || 'Unknown';
              const isUnread = !msg.is_read;
              const senderInitial = (senderDisplayName || 'S').charAt(0).toUpperCase();

              return (
                <div
                  key={msg.id}
                  onClick={() => onSelectEmail(msg)}
                  className={`flex items-start gap-3.5 px-4 py-3.5 hover:bg-[#1e1f20]/90 transition-colors cursor-pointer group select-none ${
                    isUnread ? 'bg-[#18191a]' : 'bg-[#121212]'
                  }`}
                >
                  {/* Sender Avatar Circle */}
                  <div className="pt-0.5 flex-shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-sm ${getAvatarColor(
                        msg.sender
                      )}`}
                    >
                      {senderInitial}
                    </div>
                  </div>

                  {/* Main Subject & Preview Column */}
                  <div className="flex-1 min-w-0 pr-1">
                    {/* Top Row: Sender Name + Timestamp */}
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className={`truncate text-[14px] leading-tight ${
                          isUnread ? 'font-bold text-white' : 'font-medium text-[#c4c7c5]'
                        }`}
                      >
                        {senderDisplayName}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#8ab4f8]" />
                        )}
                        <span
                          className={`text-[12px] ${
                            isUnread ? 'text-[#8ab4f8] font-semibold' : 'text-[#8e918f]'
                          }`}
                        >
                          {formatGmailTime(msg.received_at)}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Subject Line */}
                    <p
                      className={`truncate text-[13.5px] leading-snug mb-0.5 ${
                        isUnread ? 'font-semibold text-white' : 'font-normal text-[#e3e3e3]'
                      }`}
                    >
                      {msg.subject || '(No Subject)'}
                    </p>

                    {/* Bottom Row: Preview Snippet */}
                    <p className="truncate text-[12.5px] text-[#8e918f] font-normal leading-normal">
                      {msg.body_text || msg.body_html.replace(/<[^>]+>/g, ' ').slice(0, 120) || 'No message content'}
                    </p>
                  </div>

                  {/* Far Right: Star button */}
                  <div className="pt-1 flex-shrink-0">
                    <button
                      onClick={(e) => onToggleStar(msg.id, Boolean(msg.is_starred), e)}
                      title={msg.is_starred ? 'Starred' : 'Not starred'}
                      className="p-1 text-[#8e918f] hover:text-[#fbbc04] transition-colors"
                    >
                      <Star
                        className={`w-4.5 h-4.5 ${
                          msg.is_starred
                            ? 'fill-[#fbbc04] text-[#fbbc04]'
                            : 'text-[#8e918f] hover:text-[#c4c7c5]'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) Compose Button (Screenshot 3) */}
      <div className="fixed bottom-20 right-5 z-20">
        <button
          onClick={onOpenCompose}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#0b57d0] hover:bg-[#1a73e8] active:scale-95 text-white shadow-xl shadow-black/50 border border-blue-400/20 transition-all font-medium text-[14px]"
        >
          <Pencil className="w-5 h-5 text-white" />
          <span>Compose</span>
        </button>
      </div>

      {/* Bottom Navigation Bar (Clean Inbox Tab) */}
      <nav className="fixed bottom-0 inset-x-0 h-14 bg-[#1e1f20] border-t border-[#303134] flex items-center justify-center z-20 px-8">
        {/* Mail Tab */}
        <div className="flex flex-col items-center justify-center relative w-16">
          <div className="px-6 py-1.5 rounded-full bg-[#333d4d] text-[#c2e7ff] transition-colors shadow-xs">
            <Mail className="w-5 h-5" />
          </div>
          {totalUnreadCount > 0 && (
            <span className="absolute -top-1 right-2 bg-[#ea4335] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
        </div>
      </nav>
    </div>
  );
};
