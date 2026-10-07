import React from 'react';
import {
  Star,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Inbox,
  Send,
  Trash2,
  Clock,
  FileText,
  AlertOctagon,
  Tag,
  Users,
  Info
} from 'lucide-react';
import { EmailMessage, MailFolder, Draft } from '../types';
import { simulateInboundEmail } from '../lib/api';

interface EmailListViewProps {
  currentFolder: MailFolder | 'all_inboxes';
  emails: EmailMessage[];
  drafts: Draft[];
  activeEmail: string;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onTestInbound?: () => void;
  onSelectEmail: (email: EmailMessage) => void;
  onSelectDraft: (draft: Draft) => void;
  onDeleteDraft: (draftId: string, e: React.MouseEvent) => void;
  onToggleStar: (emailId: string, currentStarred: boolean, e: React.MouseEvent) => void;
  onOpenCompose: () => void;
  isCopied: boolean;
  onCopyEmail: () => void;
  darkMode: boolean;
}

export const EmailListView: React.FC<EmailListViewProps> = ({
  currentFolder,
  emails,
  drafts,
  activeEmail,
  isLoading,
  isRefreshing,
  onRefresh,
  onTestInbound,
  onSelectEmail,
  onSelectDraft,
  onDeleteDraft,
  onToggleStar,
  onOpenCompose,
  isCopied,
  onCopyEmail,
  darkMode
}) => {
  // Format Gmail-style time
  const formatGmailTime = (isoString?: string) => {
    if (!isoString) return '';
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

  const getFolderTitle = () => {
    switch (currentFolder) {
      case 'all_inboxes': return 'All Inboxes';
      case 'primary': return 'Primary';
      case 'promotions': return 'Promotions';
      case 'social': return 'Social';
      case 'updates': return 'Updates';
      case 'starred': return 'Starred';
      case 'sent': return 'Sent';
      case 'scheduled': return 'Scheduled';
      case 'drafts': return 'Drafts';
      case 'all_mail': return 'All Mail';
      case 'spam': return 'Spam';
      case 'trash': return 'Trash';
      default: return 'Inbox';
    }
  };

  const isDraftFolder = currentFolder === 'drafts';
  const [isSimulating, setIsSimulating] = React.useState(false);

  const handleTestInbound = async () => {
    setIsSimulating(true);
    try {
      if (onTestInbound) {
        await onTestInbound();
      } else {
        await simulateInboundEmail({ to: activeEmail });
        onRefresh();
      }
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative ${darkMode ? 'bg-[#121214]' : 'bg-[#fbf9f7]'}`}>
      {/* Category / Folder Header */}
      <div className="px-5 pt-2 pb-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {getFolderTitle()}
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            ({isDraftFolder ? drafts.length : emails.length})
          </span>
        </div>

        {/* Quick Email Pill and Refresh button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestInbound}
            disabled={isSimulating}
            title="Receive a live test email directly into this inbox"
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 transition-colors disabled:opacity-50"
          >
            <Mail className="w-3 h-3" />
            <span>{isSimulating ? 'Receiving...' : 'Receive Test Mail'}</span>
          </button>

          <button
            onClick={onCopyEmail}
            title="Copy your permanent address"
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-[#FF6A00]/25 text-[11px] font-mono text-[#FF8C42] transition-colors"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="max-w-[170px] truncate">{activeEmail}</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh inbox"
            className="p-1.5 text-zinc-400 hover:text-[#FF6A00] rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FF6A00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Mail List / Drafts List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {isLoading ? (
          /* Skeleton Loader */
          <div className="divide-y divide-white/5 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="flex items-center gap-3.5 px-4 py-3.5">
                <div className="w-10 h-10 rounded-full bg-white/5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-white/10 rounded" />
                  <div className="h-3 w-48 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isDraftFolder ? (
          /* Drafts List View */
          drafts.length === 0 ? (
            <div className="max-w-md mx-auto my-16 px-6 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-semibold text-white">You have no saved drafts</h3>
              <p className="text-xs text-zinc-400">
                Drafts are automatically saved every 3 seconds while typing in Compose.
              </p>
              <button
                type="button"
                onClick={onOpenCompose}
                className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow"
              >
                Compose Email
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onSelectDraft(d)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex-shrink-0">
                      Draft
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {d.to ? `To: ${d.to}` : '(No recipient specified)'}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        <span className="text-zinc-200">{d.subject || '(No subject)'}</span> — {d.body || '(Empty body)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {formatGmailTime(d.updated_at)}
                    </span>
                    <button
                      type="button"
                      title="Delete draft"
                      onClick={(e) => onDeleteDraft(d.id, e)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : emails.length === 0 ? (
          /* Empty Folder View */
          <div className="max-w-md mx-auto my-16 px-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
              {currentFolder === 'sent' ? <Send className="w-7 h-7" /> : <Inbox className="w-7 h-7" />}
            </div>
            <h3 className="text-sm font-semibold text-white">No messages in {getFolderTitle()}</h3>
            <p className="text-xs text-zinc-400">
              {currentFolder === 'sent'
                ? 'Sent messages are stored permanently and will appear here.'
                : 'All inbound messages arriving at your permanent @goldmailer.xyz address will appear here instantly.'}
            </p>
            <button
              onClick={onRefresh}
              className="mt-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-zinc-200 transition-colors"
            >
              Check for New Messages
            </button>
          </div>
        ) : (
          /* Emails List View */
          <div className="divide-y divide-white/5">
            {emails.map((e) => {
              const isUnread = !e.is_read;
              return (
                <div
                  key={e.id}
                  onClick={() => onSelectEmail(e)}
                  className={`flex items-start gap-3.5 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 ${
                    isUnread ? 'bg-[#FF6A00]/5 font-semibold' : ''
                  }`}
                >
                  {/* Sender Avatar */}
                  <div className="pt-0.5 flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-xs text-white shadow-inner">
                      {(e.sender_name || e.sender || 'S').charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Message Details */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-xs truncate ${isUnread ? 'text-white font-bold' : 'text-zinc-300'}`}>
                        {e.sender_name || e.sender}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono flex-shrink-0">
                        {formatGmailTime(e.received_at || e.created_at)}
                      </span>
                    </div>

                    <p className={`text-xs truncate ${isUnread ? 'text-white' : 'text-zinc-300'}`}>
                      {e.subject || '(No Subject)'}
                    </p>

                    <p className="text-xs text-zinc-500 truncate mt-0.5 font-normal">
                      {(e.body_text || e.text || e.body || '').slice(0, 100)}
                    </p>
                  </div>

                  {/* Star toggle */}
                  <div className="pt-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(evt) => onToggleStar(e.id, Boolean(e.is_starred), evt)}
                      className="p-1 text-zinc-500 hover:text-amber-400 transition-colors"
                    >
                      <Star className={`w-4 h-4 ${e.is_starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Compose Button on mobile */}
      <button
        onClick={onOpenCompose}
        className="sm:hidden fixed bottom-6 right-5 p-4 rounded-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-xl shadow-[#FF6A00]/30 hover:scale-105 active:scale-95 transition-all z-20 flex items-center justify-center"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};
