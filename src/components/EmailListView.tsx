import React, { useState } from 'react';
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
  Info,
  CheckSquare,
  Square,
  Archive,
  RotateCcw
} from 'lucide-react';
import { EmailMessage, MailFolder, Draft } from '../types';

interface EmailListViewProps {
  currentFolder: MailFolder | 'all_inboxes';
  emails: EmailMessage[];
  drafts: Draft[];
  activeEmail: string;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectEmail: (email: EmailMessage) => void;
  onSelectDraft: (draft: Draft) => void;
  onDeleteDraft: (draftId: string, e: React.MouseEvent) => void;
  onToggleStar: (emailId: string, currentStarred: boolean, e: React.MouseEvent) => void;
  onOpenCompose: () => void;
  isCopied: boolean;
  onCopyEmail: () => void;
  darkMode: boolean;
  onSelectFolder?: (folder: MailFolder | 'all_inboxes') => void;
  unreadCounts?: Record<string, number>;
  onMoveToTrash?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
  onRestoreEmail?: (id: string) => void;
  onBatchMoveToTrash?: (ids: string[]) => void;
  onBatchDeletePermanently?: (ids: string[]) => void;
  onBatchRestore?: (ids: string[]) => void;
  onEmptyTrash?: () => void;
}

export const EmailListView: React.FC<EmailListViewProps> = ({
  currentFolder,
  emails,
  drafts,
  activeEmail,
  isLoading,
  isRefreshing,
  onRefresh,
  onSelectEmail,
  onSelectDraft,
  onDeleteDraft,
  onToggleStar,
  onOpenCompose,
  isCopied,
  onCopyEmail,
  darkMode,
  onSelectFolder,
  unreadCounts,
  onMoveToTrash,
  onDeletePermanently,
  onRestoreEmail,
  onBatchMoveToTrash,
  onBatchDeletePermanently,
  onBatchRestore,
  onEmptyTrash
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  const isCategoryFolder =
    currentFolder === 'primary' ||
    currentFolder === 'promotions' ||
    currentFolder === 'social' ||
    currentFolder === 'updates' ||
    currentFolder === 'all_inboxes';

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map(e => e.id)));
    }
  };

  const handleBatchTrash = () => {
    if (onBatchMoveToTrash) onBatchMoveToTrash(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    if (onBatchDeletePermanently) onBatchDeletePermanently(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBatchRestoreAction = () => {
    if (onBatchRestore) onBatchRestore(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative select-none ${
      darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'
    }`}>
      {/* Top Toolbar */}
      <div className={`px-3 sm:px-5 py-2 flex items-center justify-between border-b ${
        darkMode ? 'border-white/10 bg-[#151619]' : 'border-zinc-200 bg-white'
      }`}>
        {/* Left: Folder Title and Selection checkbox or Batch Actions */}
        <div className="flex items-center gap-2.5 min-w-0">
          {!isDraftFolder && emails.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              title={selectedIds.size === emails.length ? 'Deselect all' : 'Select all'}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer"
            >
              {selectedIds.size === emails.length ? (
                <CheckSquare className="w-4 h-4 text-[#FF6A00]" />
              ) : selectedIds.size > 0 ? (
                <CheckSquare className="w-4 h-4 text-[#FF8C42] opacity-80" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          )}

          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#FF8C42]">
                {selectedIds.size} selected
              </span>
              {currentFolder === 'trash' ? (
                <>
                  <button
                    type="button"
                    onClick={handleBatchRestoreAction}
                    title="Restore selected to inbox"
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    title="Delete selected forever"
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete forever</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleBatchTrash}
                  title="Move selected to trash"
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF6A00]">
                {getFolderTitle()}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                ({isDraftFolder ? drafts.length : emails.length})
              </span>
            </div>
          )}
        </div>

        {/* Right: Quick Email Pill and Refresh button */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={onCopyEmail}
            title="Copy your permanent address"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-[#FF6A00]/25 text-[11px] font-mono text-[#FF8C42] transition-colors cursor-pointer"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="max-w-[120px] sm:max-w-[200px] truncate">{activeEmail}</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh inbox"
            className="p-1.5 text-zinc-400 hover:text-[#FF6A00] rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FF6A00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Trash Top Notice Banner */}
      {currentFolder === 'trash' && (
        <div className={`px-3 sm:px-5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b ${
          darkMode ? 'bg-zinc-900/90 border-white/5 text-zinc-400' : 'bg-orange-50/70 border-orange-100 text-zinc-700'
        }`}>
          <span>Messages in Trash will stay here until deleted permanently.</span>
          {emails.length > 0 && onEmptyTrash && (
            <button
              type="button"
              onClick={onEmptyTrash}
              className="text-xs font-bold text-red-400 hover:text-red-300 hover:underline cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Empty Trash now
            </button>
          )}
        </div>
      )}

      {/* Gmail Category Tabs (Primary, Promotions, Social, Updates) */}
      {isCategoryFolder && onSelectFolder && (
        <div className={`flex items-center border-b overflow-x-auto no-scrollbar ${
          darkMode ? 'border-white/10 bg-[#141518]' : 'border-zinc-200 bg-zinc-50'
        }`}>
          {[
            { id: 'primary', label: 'Primary', icon: Inbox, count: unreadCounts?.primary },
            { id: 'promotions', label: 'Promotions', icon: Tag, count: unreadCounts?.promotions },
            { id: 'social', label: 'Social', icon: Users, count: unreadCounts?.social },
            { id: 'updates', label: 'Updates', icon: Info, count: unreadCounts?.updates }
          ].map(tab => {
            const isActive = currentFolder === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectFolder(tab.id as any)}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-[#FF6A00] text-[#FF6A00] bg-[#FF6A00]/10 font-bold'
                    : darkMode
                      ? 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                      : 'border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF6A00]' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-[#FF6A00] text-white' : 'bg-white/10 text-zinc-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Mail List / Drafts List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {isLoading && emails.length === 0 ? (
          /* Skeleton Loader only when no emails loaded yet */
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
              <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>You have no saved drafts</h3>
              <p className="text-xs text-zinc-400">
                Drafts are automatically saved every 3 seconds while typing in Compose.
              </p>
              <button
                type="button"
                onClick={onOpenCompose}
                className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow cursor-pointer"
              >
                Compose Email
              </button>
            </div>
          ) : (
            <div className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-zinc-200'}`}>
              {drafts.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onSelectDraft(d)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors group ${
                    darkMode ? 'hover:bg-white/5' : 'hover:bg-orange-50/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex-shrink-0">
                      Draft
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                        {d.to ? `To: ${d.to}` : '(No recipient specified)'}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        <span className={darkMode ? 'text-zinc-200' : 'text-zinc-700'}>{d.subject || '(No subject)'}</span> — {d.body || '(Empty body)'}
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
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
            <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>No messages in {getFolderTitle()}</h3>
            <p className="text-xs text-zinc-400">
              {currentFolder === 'sent'
                ? 'Sent messages are stored permanently and will appear here.'
                : 'All inbound messages arriving at your permanent @goldmailer.xyz address will appear here instantly.'}
            </p>
            <button
              onClick={onRefresh}
              className={`mt-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                darkMode ? 'bg-white/10 hover:bg-white/15 text-zinc-200' : 'bg-orange-500/10 hover:bg-orange-500/20 text-[#FF6A00]'
              }`}
            >
              Check for New Messages
            </button>
          </div>
        ) : (
          /* Emails List View */
          <div className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-zinc-200'}`}>
            {emails.map((e) => {
              const isUnread = !e.is_read;
              const isSelected = selectedIds.has(e.id);
              const senderName = e.sender_name || (typeof e.sender === 'string' ? e.sender.split('@')[0] : 'Sender');
              const snippet = (e.body_text || e.text || e.body || '').replace(/<[^>]+>/g, '').trim().slice(0, 120);

              return (
                <div
                  key={e.id}
                  onClick={() => onSelectEmail(e)}
                  className={`group flex items-start sm:items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer transition-colors ${
                    darkMode
                      ? isSelected
                        ? 'bg-[#FF6A00]/15'
                        : isUnread
                          ? 'bg-white/[0.04] font-semibold hover:bg-white/[0.08]'
                          : 'hover:bg-white/5 text-zinc-400'
                      : isSelected
                        ? 'bg-orange-100'
                        : isUnread
                          ? 'bg-orange-50/80 font-semibold hover:bg-orange-100/70 text-zinc-900'
                          : 'hover:bg-zinc-100/80 text-zinc-700'
                  }`}
                >
                  {/* Desktop Selection Checkbox */}
                  <div className="hidden sm:flex items-center pt-0.5 sm:pt-0 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(evt) => handleToggleSelect(e.id, evt)}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-300"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#FF6A00]" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  </div>

                  {/* Star Toggle */}
                  <div className="pt-0.5 sm:pt-0 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(evt) => onToggleStar(e.id, Boolean(e.is_starred), evt)}
                      className="p-1 text-zinc-400 hover:text-amber-400 transition-colors"
                      title={e.is_starred ? 'Unstar' : 'Star message'}
                    >
                      <Star className={`w-4 h-4 ${e.is_starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </div>

                  {/* Sender Avatar (Mobile view) */}
                  <div className="sm:hidden pt-0.5 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-xs text-white shadow-inner">
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Sender Name */}
                  <div className="hidden sm:block w-44 flex-shrink-0 truncate">
                    <span className={`text-xs ${isUnread ? (darkMode ? 'text-white font-bold' : 'text-zinc-950 font-bold') : (darkMode ? 'text-zinc-300' : 'text-zinc-800')}`}>
                      {senderName}
                    </span>
                  </div>

                  {/* Message Details (Subject + Snippet) */}
                  <div className="flex-1 min-w-0 pr-1">
                    {/* Mobile top row: sender and time */}
                    <div className="sm:hidden flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-xs truncate ${isUnread ? (darkMode ? 'text-white font-bold' : 'text-zinc-950 font-bold') : (darkMode ? 'text-zinc-300' : 'text-zinc-800')}`}>
                        {senderName}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono flex-shrink-0">
                        {formatGmailTime(e.received_at || e.created_at)}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 text-xs truncate">
                      <span className={`truncate ${isUnread ? (darkMode ? 'text-white font-bold' : 'text-zinc-950 font-bold') : (darkMode ? 'text-zinc-300' : 'text-zinc-800')}`}>
                        {e.subject || '(No Subject)'}
                      </span>
                      <span className={`hidden sm:inline text-xs truncate ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        — {snippet || '(Empty body)'}
                      </span>
                    </div>

                    {/* Mobile snippet line */}
                    <p className={`sm:hidden text-xs truncate mt-0.5 font-normal ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {snippet || '(Empty body)'}
                    </p>
                  </div>

                  {/* Quick Action Buttons (Restore / Delete) & Timestamp */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {currentFolder === 'trash' ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            if (onRestoreEmail) onRestoreEmail(e.id);
                          }}
                          title="Restore to Inbox"
                          className="p-1 sm:p-1.5 rounded-md hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            if (onDeletePermanently) onDeletePermanently(e.id);
                          }}
                          title="Delete forever"
                          className="p-1 sm:p-1.5 rounded-md hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="hidden sm:group-hover:flex items-center">
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            if (onMoveToTrash) onMoveToTrash(e.id);
                          }}
                          title="Delete"
                          className="p-1.5 rounded-md hover:bg-red-500/15 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="hidden sm:block text-[11px] font-mono text-zinc-500">
                      {formatGmailTime(e.received_at || e.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button (+ Compose email) on mobile screens - elevated above downside navigation */}
      <button
        onClick={onOpenCompose}
        title="Compose new email"
        className="lg:hidden fixed bottom-20 right-5 px-4 py-3 rounded-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-2xl shadow-[#FF6A00]/50 hover:scale-105 active:scale-95 transition-all z-40 flex items-center gap-2 cursor-pointer font-bold text-xs"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span className="tracking-wide">Compose</span>
      </button>
    </div>
  );
};
