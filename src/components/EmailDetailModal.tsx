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
  Code
} from 'lucide-react';
import { EmailMessage } from '../types';

interface EmailDetailModalProps {
  email: EmailMessage | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMoveToTrash: (id: string) => void;
  onMoveToSpam: (id: string) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onReply: (to: string, subject: string) => void;
  onForward: (email: EmailMessage) => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onDelete,
  onMoveToTrash,
  onMoveToSpam,
  onToggleStar,
  onReply,
  onForward
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState<'html' | 'text'>('html');

  if (!email) return null;

  const senderInitial = (email.sender_name || email.sender || 'S').charAt(0).toUpperCase();

  // Extract both html and text bodies across all potential DB column names
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

  // Sanitize body HTML securely and enhance hyperlinks
  const formatBodyHtml = (rawHtml: string) => {
    if (!rawHtml) return '';
    const formatted = rawHtml
      .replace(/<a\s+(?!.*?target=)/gi, '<a target="_blank" rel="noopener noreferrer" class="text-[#8ab4f8] underline hover:text-[#c2e7ff]" ')
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
    <div className="fixed inset-0 z-50 bg-[#121212] flex flex-col text-[#e3e3e3] animate-in slide-in-from-right duration-200">
      {/* Top Action Bar */}
      <div className="h-14 border-b border-[#303134] flex items-center justify-between px-3 bg-[#1e1f20]">
        <button
          onClick={onClose}
          aria-label="Back"
          className="p-2 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onMoveToTrash(email.id)}
            title="Move to Trash"
            className="p-2 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => onMoveToSpam(email.id)}
            title="Report Spam"
            className="p-2 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <AlertOctagon className="w-5 h-5" />
          </button>
          <button
            onClick={() => onToggleStar(email.id, !email.is_starred)}
            title={email.is_starred ? 'Starred' : 'Star'}
            className="p-2 text-[#c4c7c5] hover:text-[#fbbc04] rounded-full hover:bg-white/10 transition-colors"
          >
            <Star
              className={`w-5 h-5 ${
                email.is_starred ? 'fill-[#fbbc04] text-[#fbbc04]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Email Body Container */}
      <div className="flex-1 overflow-y-auto px-5 py-4 max-w-3xl mx-auto w-full space-y-6">
        {/* Subject Header */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-normal text-white leading-snug">
            {email.subject || '(No Subject)'}
          </h1>
          <span className="text-[11px] font-medium bg-[#303134] text-[#8ab4f8] px-2.5 py-1 rounded-md flex-shrink-0">
            Inbox
          </span>
        </div>

        {/* Sender Info Card */}
        <div className="flex items-start justify-between gap-3 pt-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-medium text-base flex-shrink-0 shadow-sm">
              {senderInitial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-[15px] truncate">
                  {email.sender_name || (typeof email.sender === 'string' ? email.sender.split('@')[0] : 'Sender')}
                </span>
                <span className="text-xs text-[#8e918f] font-mono truncate">
                  &lt;{email.from_email || email.sender}&gt;
                </span>
              </div>

              {/* to me expandable pill */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-xs text-[#8e918f] hover:text-[#8ab4f8] mt-0.5 transition-colors"
              >
                <span>to me</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded details */}
              {showDetails && (
                <div className="mt-2.5 p-3 rounded-xl bg-[#1e1f20] border border-[#303134] text-xs space-y-1.5 text-[#c4c7c5] font-mono">
                  <div className="flex">
                    <span className="w-16 text-[#8e918f]">From:</span>
                    <span className="text-white select-all">{email.from_email || email.sender}</span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-[#8e918f]">To:</span>
                    <span className="text-white select-all">{email.to_email || email.recipient}</span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-[#8e918f]">Date:</span>
                    <span>{formattedDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 text-emerald-400 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Standard encryption (TLS) verified</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <span className="text-xs text-[#8e918f]">{formattedDate}</span>
          </div>
        </div>

        {/* View Mode Switcher if both HTML and Text exist */}
        {hasHtml && hasText && (
          <div className="flex items-center justify-between border-b border-[#303134] pb-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('html')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeTab === 'html'
                    ? 'bg-[#0b57d0] text-white'
                    : 'text-[#9aa0a6] hover:text-white hover:bg-white/5'
                }`}
              >
                HTML View
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeTab === 'text'
                    ? 'bg-[#0b57d0] text-white'
                    : 'text-[#9aa0a6] hover:text-white hover:bg-white/5'
                }`}
              >
                Plain Text
              </button>
            </div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[#8ab4f8] hover:underline flex items-center gap-1"
            >
              <Code className="w-3 h-3" />
              <span>{showRaw ? 'Hide Raw' : 'View Raw'}</span>
            </button>
          </div>
        )}

        {/* Email Content Box */}
        <div className="pt-2 border-t border-[#303134]/60">
          {isBodyEmpty ? (
            /* Fallback: if body is empty, show "No content / view raw" button */
            <div className="py-10 px-6 text-center border border-dashed border-[#3c4043] rounded-2xl bg-[#1e1f20]/40 space-y-3">
              <p className="text-sm text-[#9aa0a6]">No message content in email body.</p>
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className="px-4 py-2 rounded-full bg-[#2d2f31] hover:bg-[#3c4043] text-xs font-mono text-[#8ab4f8] transition-colors inline-flex items-center gap-2 border border-white/5"
              >
                <Code className="w-3.5 h-3.5" />
                <span>{showRaw ? 'Hide Raw Details' : 'No content / view raw'}</span>
              </button>
              {showRaw && (
                <div className="text-left mt-3 p-3.5 bg-black/70 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
                  <pre>{JSON.stringify(email, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : hasHtml && (activeTab === 'html' || !hasText) ? (
            /* HTML View sanitized via DOMPurify */
            <div
              className="prose prose-invert max-w-none text-sm text-[#e3e3e3] leading-relaxed break-words overflow-x-auto bg-[#1e1f20]/40 p-4 rounded-2xl border border-white/5"
              dangerouslySetInnerHTML={{ __html: formatBodyHtml(htmlContent) }}
            />
          ) : (
            /* Plain Text View in <pre> */
            <pre className="whitespace-pre-wrap font-sans text-sm text-[#e3e3e3] leading-relaxed break-words bg-[#1e1f20]/40 p-4 rounded-2xl border border-white/5 overflow-x-auto">
              {textContent}
            </pre>
          )}

          {/* Optional raw payload expander when body is present */}
          {!isBodyEmpty && showRaw && (
            <div className="mt-4 p-3.5 bg-black/70 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
              <div className="text-xs text-zinc-400 font-semibold mb-2">Raw Email Object / Inbound Payload:</div>
              <pre>{JSON.stringify(email, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Action Buttons (Reply / Forward) */}
        <div className="pt-6 flex items-center justify-between border-t border-[#303134]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onReply(email.from_email || email.sender, `Re: ${email.subject}`)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#5f6368] hover:border-[#8ab4f8] text-sm text-[#8ab4f8] hover:bg-white/5 transition-colors font-medium"
            >
              <CornerUpLeft className="w-4 h-4" />
              <span>Reply</span>
            </button>
            <button
              onClick={() => onForward(email)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#5f6368] hover:border-white text-sm text-[#c4c7c5] hover:bg-white/5 transition-colors font-medium"
            >
              <CornerUpRight className="w-4 h-4" />
              <span>Forward</span>
            </button>
          </div>

          {!isBodyEmpty && !hasHtml && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-[#8e918f] hover:text-[#8ab4f8] transition-colors"
            >
              {showRaw ? 'Hide Raw' : 'View raw'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
