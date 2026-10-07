import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Clock,
  Trash2,
  Minimize2,
  Maximize2,
  Calendar,
  AlertCircle,
  Check,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { Draft } from '../types';
import { saveDraft, deleteDraft, sendEmail } from '../lib/api';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  onEmailSent?: (email?: any) => void;
  initialDraft?: Draft | null;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  activeEmail,
  onEmailSent,
  initialDraft = null,
  initialTo = '',
  initialSubject = '',
  initialBody = ''
}) => {
  const [draftId, setDraftId] = useState<string>(() => initialDraft?.id || 'drf_' + Math.random().toString(36).substring(2, 9));
  const [to, setTo] = useState(initialDraft?.to || initialTo || '');
  const [cc, setCc] = useState(initialDraft?.cc || '');
  const [bcc, setBcc] = useState(initialDraft?.bcc || '');
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initialDraft?.cc || initialDraft?.bcc));
  const [subject, setSubject] = useState(initialDraft?.subject || initialSubject || '');
  const [body, setBody] = useState(initialDraft?.body || initialBody || '');

  const [isSending, setIsSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [draftStatus, setDraftStatus] = useState<string>(''); // e.g. "Draft saved at 11:42 PM"
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastSavedRef = useRef({ to: '', cc: '', bcc: '', subject: '', body: '' });

  // Update when initial draft changes
  useEffect(() => {
    if (initialDraft) {
      setDraftId(initialDraft.id);
      setTo(initialDraft.to || '');
      setCc(initialDraft.cc || '');
      setBcc(initialDraft.bcc || '');
      setSubject(initialDraft.subject || '');
      setBody(initialDraft.body || '');
      lastSavedRef.current = {
        to: initialDraft.to || '',
        cc: initialDraft.cc || '',
        bcc: initialDraft.bcc || '',
        subject: initialDraft.subject || '',
        body: initialDraft.body || ''
      };
    } else if (isOpen) {
      setDraftId('drf_' + Math.random().toString(36).substring(2, 9));
      setTo(initialTo);
      setSubject(initialSubject);
      setBody(initialBody);
      lastSavedRef.current = { to: initialTo, cc: '', bcc: '', subject: initialSubject, body: initialBody };
    }
  }, [initialDraft, isOpen, initialTo, initialSubject, initialBody]);

  // Auto-save draft every 3 seconds if content changed
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(async () => {
      const hasContent = to.trim() || subject.trim() || body.trim();
      if (!hasContent) return;

      const hasChanged =
        to !== lastSavedRef.current.to ||
        cc !== lastSavedRef.current.cc ||
        bcc !== lastSavedRef.current.bcc ||
        subject !== lastSavedRef.current.subject ||
        body !== lastSavedRef.current.body;

      if (hasChanged) {
        setIsSavingDraft(true);
        try {
          const res = await saveDraft({
            id: draftId,
            to: to.trim(),
            cc: cc.trim(),
            bcc: bcc.trim(),
            subject: subject.trim(),
            body: body.trim()
          });
          lastSavedRef.current = { to, cc, bcc, subject, body };
          setDraftStatus(`Draft saved at ${res.saved_at_formatted || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch {
          // ignore draft auto save error
        } finally {
          setIsSavingDraft(false);
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isOpen, draftId, to, cc, bcc, subject, body]);

  if (!isOpen) return null;

  // Handle closing modal (saves draft if not empty)
  const handleClose = async () => {
    if (to.trim() || subject.trim() || body.trim()) {
      try {
        await saveDraft({
          id: draftId,
          to: to.trim(),
          cc: cc.trim(),
          bcc: bcc.trim(),
          subject: subject.trim(),
          body: body.trim()
        });
      } catch {}
    }
    onClose();
  };

  // Discard draft
  const handleDiscard = async () => {
    try {
      await deleteDraft(draftId);
    } catch {}
    onClose();
  };

  // Send email
  const handleSend = async (scheduleIso?: string) => {
    if (!to.trim()) {
      setError('Please specify at least one recipient.');
      return;
    }
    setError(null);
    setIsSending(true);
    try {
      const sendRes = await sendEmail({
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim() || '(No Subject)',
        body: body.trim(),
        sender: activeEmail,
        scheduled_for: scheduleIso || (scheduledFor ? new Date(scheduledFor).toISOString() : undefined),
        draft_id: draftId
      });
      if (onEmailSent) onEmailSent(sendRes?.email);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`fixed z-50 transition-all ${
      isMinimized
        ? 'bottom-0 right-4 sm:right-10 w-72 sm:w-80 shadow-2xl'
        : 'fixed inset-0 sm:inset-auto sm:bottom-4 sm:right-6 w-full sm:w-[600px] sm:max-w-[90vw] flex flex-col'
    }`}>
      {/* Background Dimmer on Mobile if not minimized */}
      {!isMinimized && (
        <div className="sm:hidden fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={handleClose} />
      )}

      {/* Main Window */}
      <div className={`relative bg-[#1c1d22]/95 border border-[#FF6A00]/30 rounded-t-2xl sm:rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden text-white z-10 backdrop-blur-xl ${
        isMinimized ? 'h-12' : 'h-[85vh] sm:h-[580px]'
      }`}>
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#24252c] to-[#1c1d22] border-b border-white/10 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]" />
            <span className="text-xs font-semibold text-white tracking-wide">
              {subject ? subject.slice(0, 30) : 'New Message'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:text-white rounded hover:bg-white/10"
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 hover:text-white rounded hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Recipient To */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium w-8">To</span>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-[11px] text-[#FF8C42] hover:underline"
                >
                  Cc/Bcc
                </button>
              )}
            </div>

            {/* Optional CC / BCC */}
            {showCcBcc && (
              <>
                <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-medium w-8">Cc</span>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
                  />
                </div>
                <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-medium w-8">Bcc</span>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
                  />
                </div>
              </>
            )}

            {/* Subject */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 text-xs">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full bg-transparent text-sm font-medium text-white placeholder-zinc-500 outline-none"
              />
            </div>

            {/* Body */}
            <div className="flex-1 p-4 overflow-y-auto">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email here..."
                className="w-full h-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed font-sans"
              />
            </div>

            {/* Schedule popup if requested */}
            {showSchedule && (
              <div className="mx-4 mb-2 p-3 bg-black/50 border border-[#FF6A00]/30 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#FF8C42] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Schedule dispatch
                  </span>
                  <button type="button" onClick={() => setShowSchedule(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSend(new Date(Date.now() + 10 * 60000).toISOString())}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px]"
                  >
                    In 10 mins
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(new Date(Date.now() + 60 * 60000).toISOString())}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px]"
                  >
                    In 1 hour
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(new Date(Date.now() + 24 * 3600000).toISOString())}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px]"
                  >
                    Tomorrow morning
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Footer Actions & Real-Time Draft Indicator */}
            <div className="px-4 py-3 bg-[#18191d] border-t border-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl shadow-md">
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSend()}
                    className="px-5 py-2.5 rounded-l-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Sending...' : 'Send'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSchedule(!showSchedule)}
                    className="px-2 rounded-r-xl bg-[#FF8C42] hover:bg-[#FF6A00] text-white border-l border-white/20 transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Real-time Draft Saving Status */}
                <div className="text-[11px] text-zinc-400 pl-2 flex items-center gap-1.5">
                  {isSavingDraft ? (
                    <span className="text-[#FF8C42] animate-pulse">Saving draft...</span>
                  ) : draftStatus ? (
                    <span className="text-zinc-400">{draftStatus}</span>
                  ) : (
                    <span>Auto-saves to Drafts</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Discard draft"
                  onClick={handleDiscard}
                  className="p-2 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
