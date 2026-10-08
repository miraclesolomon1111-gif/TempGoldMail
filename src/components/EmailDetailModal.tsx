import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Archive,
  AlertOctagon,
  Trash2,
  Mail,
  Star,
  CornerUpLeft,
  CornerUpRight,
  ChevronDown,
  Copy,
  Check,
  ShieldCheck,
  Code,
  RotateCcw,
  Send,
  Maximize2
} from 'lucide-react';
import { EmailMessage } from '../types';
import { sendEmail } from '../lib/api';

interface EmailDetailModalProps {
  email: EmailMessage | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMoveToTrash: (id: string) => void;
  onRestore?: (id: string) => void;
  onMoveToSpam: (id: string) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onReply: (to: string, subject: string) => void;
  onForward: (email: EmailMessage) => void;
  darkMode?: boolean;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onDelete,
  onMoveToTrash,
  onRestore,
  onMoveToSpam,
  onToggleStar,
  onReply,
  onForward,
  darkMode = true
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState<'html' | 'text'>('html');
  const [isInlineReplying, setIsInlineReplying] = useState(false);
  const [inlineReplyBody, setInlineReplyBody] = useState('');
  const [isSendingInline, setIsSendingInline] = useState(false);
  const [inlineSentSuccess, setInlineSentSuccess] = useState(false);

  if (!email) return null;

  const senderInitial = (email.sender_name || email.sender || 'S').charAt(0).toUpperCase();

  const htmlContent =
    email.html ||
    email.body_html ||
    (typeof email.body === 'string' && email.body.includes('<') ? email.body : '');

  const textContent =
    email.text ||
    email.body_text ||
    (typeof email.body === 'string' && !email.body.includes('<') ? email.body : '');

  const hasHtml = Boolean(htmlContent && htmlContent.trim().length > 0);
  const hasText = Boolean(textContent && textContent.trim().length > 0);
  const isBodyEmpty = !hasHtml && !hasText;

  const handleCopySender = () => {
    navigator.clipboard.writeText(email.sender);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const formatBodyHtml = (rawHtml: string) => {
    if (!rawHtml) return '';
    const formatted = rawHtml
      .replace(/<a\s+(?!.*?target=)/gi, '<a target="_blank" rel="noopener noreferrer" class="text-[#FF8C42] underline hover:text-[#FF6A00]" ')
      .replace(/target="_self"/gi, 'target="_blank" rel="noopener noreferrer"');

    return DOMPurify.sanitize(formatted, {
      ADD_ATTR: ['target', 'rel', 'class'],
      FORBID_TAGS: ['script', 'iframe']
    });
  };

  const formattedDate = new Date(email.received_at || email.created_at || Date.now()).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <div className={`fixed inset-0 z-50 flex flex-col animate-in slide-in-from-right duration-200 ${
      darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'
    }`}>
      {/* Top Action Bar */}
      <div className={`h-14 border-b flex items-center justify-between px-3 backdrop-blur-xl ${
        darkMode ? 'bg-[#18191d]/95 border-white/10' : 'bg-white/95 border-orange-200'
      }`}>
        <button
          onClick={onClose}
          aria-label="Back"
          className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 text-zinc-400">
          {email.folder === 'trash' ? (
            <>
              <button
                onClick={() => onRestore && onRestore(email.id)}
                title="Restore to Inbox"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Restore</span>
              </button>
              <button
                onClick={() => onDelete(email.id)}
                title="Delete forever"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete forever</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onMoveToTrash(email.id)}
                title="Move to trash"
                className="p-2 hover:text-red-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => onMoveToSpam(email.id)}
                title="Report spam"
                className="p-2 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <AlertOctagon className="w-5 h-5" />
              </button>
              <button
                onClick={() => onToggleStar(email.id, Boolean(email.is_starred))}
                title="Star message"
                className="p-2 hover:text-amber-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Star className={`w-5 h-5 ${email.is_starred ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Reading View */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
        {/* Trash Notice Banner */}
        {email.folder === 'trash' && (
          <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            darkMode ? 'bg-zinc-900 border-zinc-700/80 text-zinc-300' : 'bg-orange-50/80 border-orange-200 text-zinc-800'
          }`}>
            <span className="font-medium">This message is in Trash.</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRestore && onRestore(email.id)}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-semibold transition-colors cursor-pointer"
              >
                Restore to Inbox
              </button>
              <button
                onClick={() => onDelete(email.id)}
                className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors cursor-pointer"
              >
                Delete forever
              </button>
            </div>
          </div>
        )}

        {/* Subject Header */}
        <div className="flex items-start justify-between gap-4">
          <h1 className={`text-xl sm:text-2xl font-bold tracking-tight leading-snug ${
            darkMode ? 'text-white' : 'text-zinc-900'
          }`}>
            {email.subject || '(No Subject)'}
          </h1>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FF6A00]/15 text-[#FF8C42] border border-[#FF6A00]/30 uppercase tracking-wider flex-shrink-0">
            {email.folder || 'Inbox'}
          </span>
        </div>

        {/* Sender details pill */}
        <div className="flex items-start gap-3.5 pt-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white text-base shadow flex-shrink-0">
            {senderInitial}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`font-bold text-sm truncate ${
                darkMode ? 'text-white' : 'text-zinc-900'
              }`}>
                {email.sender_name || email.sender}
              </span>
              <span className="text-xs text-zinc-400 font-mono flex-shrink-0">
                {formattedDate}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-[#FF8C42] font-mono truncate">{email.sender}</span>
              <button
                type="button"
                onClick={handleCopySender}
                title="Copy sender address"
                className="text-zinc-500 hover:text-white"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 mt-0.5">
              to <span className="font-mono text-zinc-400">{email.recipient}</span>
            </p>
          </div>
        </div>

        {/* View mode switcher */}
        {hasHtml && hasText && (
          <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('html')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'html' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                HTML View
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'text' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Plain Text
              </button>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="pt-2">
          {isBodyEmpty ? (
            <div className="py-10 px-6 text-center border border-dashed border-white/10 rounded-2xl bg-white/5 space-y-2">
              <p className="text-sm text-zinc-400">No message content in email body.</p>
            </div>
          ) : hasHtml && (activeTab === 'html' || !hasText) ? (
            <div
              className="prose prose-invert max-w-none text-sm leading-relaxed bg-white/5 p-5 rounded-2xl border border-white/10 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: formatBodyHtml(htmlContent) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-white/5 p-5 rounded-2xl border border-white/10 overflow-x-auto text-zinc-200">
              {textContent}
            </pre>
          )}
        </div>

        {/* Reply & Forward Actions (Google Gmail Style) */}
        <div className="pt-6 border-t border-white/10 space-y-4">
          {!isInlineReplying ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsInlineReplying(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <CornerUpLeft className="w-4 h-4" />
                <span>Reply</span>
              </button>
              <button
                type="button"
                onClick={() => onForward(email)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <CornerUpRight className="w-4 h-4" />
                <span>Forward</span>
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#1b1c22] border border-[#FF6A00]/30 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <CornerUpLeft className="w-4 h-4 text-[#FF8C42]" />
                  <span className="font-semibold text-white">Reply to:</span>
                  <span className="font-mono text-[#FF8C42]">{email.from_email || email.sender}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onReply(email.from_email || email.sender, `Re: ${email.subject}`)}
                  title="Pop out to full compose window"
                  className="p-1 hover:text-white rounded hover:bg-white/10 flex items-center gap-1 text-[11px]"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pop out</span>
                </button>
              </div>

              <textarea
                value={inlineReplyBody}
                onChange={(e) => setInlineReplyBody(e.target.value)}
                placeholder="Write your reply..."
                rows={4}
                className="w-full bg-[#141519] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 outline-none resize-none focus:border-[#FF6A00]/50"
              />

              {inlineSentSuccess ? (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Reply dispatched successfully!</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSendingInline || !inlineReplyBody.trim()}
                      onClick={async () => {
                        setIsSendingInline(true);
                        try {
                          await sendEmail({
                            to: email.from_email || email.sender,
                            subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
                            body: inlineReplyBody.trim(),
                            sender: email.recipient
                          });
                          setInlineSentSuccess(true);
                          setTimeout(() => {
                            setInlineSentSuccess(false);
                            setIsInlineReplying(false);
                            setInlineReplyBody('');
                          }, 1500);
                        } catch (err: any) {
                          alert(err.message || 'Failed to dispatch reply');
                        } finally {
                          setIsSendingInline(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold flex items-center gap-2 hover:opacity-95 disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingInline ? 'Sending...' : 'Send'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInlineReplying(false)}
                      className="px-3 py-2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
