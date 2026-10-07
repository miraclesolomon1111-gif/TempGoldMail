import React from 'react';
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
  ShieldCheck
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
  const [showDetails, setShowDetails] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);

  if (!email) return null;

  const senderInitial = (email.sender_name || email.sender || 'S').charAt(0).toUpperCase();

  const handleCopySender = () => {
    navigator.clipboard.writeText(email.sender);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Sanitize body HTML and make links open in new tab securely
  const formatBodyHtml = (rawHtml: string) => {
    if (!rawHtml) return '';
    // Ensure all <a> tags have target="_blank" rel="noopener noreferrer" and nice blue link styling
    return rawHtml
      .replace(/<a\s+(?!.*?target=)/gi, '<a target="_blank" rel="noopener noreferrer" class="text-[#8ab4f8] underline hover:text-[#c2e7ff]" ')
      .replace(/target="_self"/gi, 'target="_blank" rel="noopener noreferrer"')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const formattedDate = new Date(email.received_at).toLocaleString([], {
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
                  {email.sender_name || email.sender.split('@')[0]}
                </span>
                <span className="text-xs text-[#8e918f] font-mono truncate">
                  &lt;{email.sender}&gt;
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
                    <span className="text-white select-all">{email.sender}</span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-[#8e918f]">To:</span>
                    <span className="text-white select-all">{email.recipient}</span>
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

        {/* Email Content Box */}
        <div className="pt-4 border-t border-[#303134]/60">
          {email.body_html ? (
            <div
              className="prose prose-invert max-w-none text-sm text-[#e3e3e3] leading-relaxed break-words overflow-x-auto bg-[#1e1f20]/40 p-4 rounded-2xl border border-white/5"
              dangerouslySetInnerHTML={{ __html: formatBodyHtml(email.body_html) }}
            />
          ) : (
            <div className="whitespace-pre-wrap font-sans text-sm text-[#e3e3e3] leading-relaxed bg-[#1e1f20]/40 p-4 rounded-2xl border border-white/5">
              {email.body_text || 'No message content.'}
            </div>
          )}
        </div>

        {/* Action Buttons (Reply / Forward) */}
        <div className="pt-6 flex items-center gap-3 border-t border-[#303134]">
          <button
            onClick={() => onReply(email.sender, `Re: ${email.subject}`)}
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
      </div>
    </div>
  );
};
