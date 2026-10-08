import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Trash2,
  Minimize2,
  Maximize2,
  Calendar,
  AlertCircle,
  Check,
  ChevronDown,
  Paperclip,
  Link2,
  Smile,
  ImageIcon,
  Lock,
  PenTool,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Sparkles,
  FileText
} from 'lucide-react';
import { Draft } from '../types';
import { saveDraft, deleteDraft, sendEmail } from '../lib/api';

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

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
  
  // Recipient lists and current inputs
  const [toInput, setToInput] = useState('');
  const [toChips, setToChips] = useState<string[]>([]);
  
  const [ccInput, setCcInput] = useState('');
  const [ccChips, setCcChips] = useState<string[]>([]);
  
  const [bccInput, setBccInput] = useState('');
  const [bccChips, setBccChips] = useState<string[]>([]);
  
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  
  const [subject, setSubject] = useState(initialDraft?.subject || initialSubject || '');
  const [body, setBody] = useState(initialDraft?.body || initialBody || '');

  // UI state
  const [isSending, setIsSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [customScheduleDate, setCustomScheduleDate] = useState('');
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formatting bar toggle & options
  const [showFormatting, setShowFormatting] = useState(false);
  const [fontFamily, setFontFamily] = useState('sans');
  const [fontSize, setFontSize] = useState('normal');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  // Modals / popovers
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef({ to: '', cc: '', bcc: '', subject: '', body: '' });

  // Parse comma or space separated emails into chip array
  const parseEmailsToChips = (raw: string): string[] => {
    return raw
      .split(/[,;\s]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
  };

  // Sync initial state
  useEffect(() => {
    if (initialDraft) {
      setDraftId(initialDraft.id);
      setToChips(initialDraft.to ? parseEmailsToChips(initialDraft.to) : []);
      setToInput('');
      setCcChips(initialDraft.cc ? parseEmailsToChips(initialDraft.cc) : []);
      setBccChips(initialDraft.bcc ? parseEmailsToChips(initialDraft.bcc) : []);
      setShowCc(Boolean(initialDraft.cc));
      setShowBcc(Boolean(initialDraft.bcc));
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
      setToChips(initialTo ? parseEmailsToChips(initialTo) : []);
      setToInput('');
      setCcChips([]);
      setBccChips([]);
      setShowCc(false);
      setShowBcc(false);
      setSubject(initialSubject);
      setBody(initialBody);
      setAttachedFiles([]);
      setIsConfidential(false);
      setHasSignature(false);
      lastSavedRef.current = { to: initialTo, cc: '', bcc: '', subject: initialSubject, body: initialBody };
    }
  }, [initialDraft, isOpen, initialTo, initialSubject, initialBody]);

  // Combined recipient strings
  const getFullToString = () => {
    const list = [...toChips];
    if (toInput.trim()) list.push(toInput.trim());
    return list.join(', ');
  };

  const getFullCcString = () => {
    const list = [...ccChips];
    if (ccInput.trim()) list.push(ccInput.trim());
    return list.join(', ');
  };

  const getFullBccString = () => {
    const list = [...bccChips];
    if (bccInput.trim()) list.push(bccInput.trim());
    return list.join(', ');
  };

  // Auto-save draft every 3 seconds if content changed
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(async () => {
      const fullTo = getFullToString();
      const fullCc = getFullCcString();
      const fullBcc = getFullBccString();
      const hasContent = fullTo.trim() || subject.trim() || body.trim();
      if (!hasContent) return;

      const hasChanged =
        fullTo !== lastSavedRef.current.to ||
        fullCc !== lastSavedRef.current.cc ||
        fullBcc !== lastSavedRef.current.bcc ||
        subject !== lastSavedRef.current.subject ||
        body !== lastSavedRef.current.body;

      if (hasChanged) {
        setIsSavingDraft(true);
        try {
          const res = await saveDraft({
            id: draftId,
            to: fullTo.trim(),
            cc: fullCc.trim(),
            bcc: fullBcc.trim(),
            subject: subject.trim(),
            body: body.trim()
          });
          lastSavedRef.current = { to: fullTo, cc: fullCc, bcc: fullBcc, subject, body };
          setDraftStatus(`Draft saved at ${res?.saved_at_formatted || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch {
          // ignore draft auto save error
        } finally {
          setIsSavingDraft(false);
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isOpen, draftId, toChips, toInput, ccChips, ccInput, bccChips, bccInput, subject, body]);

  if (!isOpen) return null;

  // Add chip helper
  const handleKeyDownRecipient = (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputVal: string,
    setInputVal: (val: string) => void,
    chips: string[],
    setChips: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (inputVal.trim()) {
        e.preventDefault();
        const newEmails = parseEmailsToChips(inputVal);
        setChips(prev => Array.from(new Set([...prev, ...newEmails])));
        setInputVal('');
      }
    } else if (e.key === 'Backspace' && !inputVal && chips.length > 0) {
      e.preventDefault();
      setChips(prev => prev.slice(0, prev.length - 1));
    }
  };

  // Handle closing modal (saves draft if not empty)
  const handleClose = async () => {
    const fullTo = getFullToString();
    if (fullTo.trim() || subject.trim() || body.trim()) {
      try {
        await saveDraft({
          id: draftId,
          to: fullTo.trim(),
          cc: getFullCcString().trim(),
          bcc: getFullBccString().trim(),
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

  // Insert formatting wrapper
  const applyTextFormat = (tag: string, placeholder = 'text') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || placeholder;

    let formatted = '';
    if (tag === 'b') formatted = `**${selected}**`;
    else if (tag === 'i') formatted = `*${selected}*`;
    else if (tag === 'u') formatted = `_${selected}_`;
    else if (tag === 's') formatted = `~~${selected}~~`;
    else if (tag === 'quote') formatted = `\n> ${selected}\n`;
    else if (tag === 'bullet') formatted = `\n- ${selected}`;
    else if (tag === 'numbered') formatted = `\n1. ${selected}`;
    else formatted = selected;

    const nextBody = body.slice(0, start) + formatted + body.slice(end);
    setBody(nextBody);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + formatted.length, start + formatted.length);
    }, 0);
  };

  // Insert Link
  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const cleanUrl = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    const display = linkText.trim() || cleanUrl;
    const linkMd = `[${display}](${cleanUrl})`;
    setBody(prev => prev + (prev.endsWith('\n') || !prev ? '' : ' ') + linkMd);
    setLinkText('');
    setLinkUrl('');
    setShowLinkModal(false);
  };

  // File Attachment handling
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles: AttachedFile[] = Array.from(e.target.files).map(f => ({
      id: 'att_' + Math.random().toString(36).substring(2, 9),
      name: f.name,
      size: f.size,
      type: f.type
    }));
    setAttachedFiles(prev => [...prev, ...newFiles]);
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Toggle Signature
  const toggleSignature = () => {
    const signatureText = `\n\n--\nBest regards,\n${activeEmail}`;
    if (hasSignature) {
      setBody(prev => prev.replace(signatureText, ''));
      setHasSignature(false);
    } else {
      setBody(prev => prev + signatureText);
      setHasSignature(true);
    }
  };

  // Send email
  const handleSend = async (scheduleIso?: string) => {
    const fullTo = getFullToString();
    if (!fullTo.trim()) {
      setError('Please specify at least one recipient.');
      return;
    }
    setError(null);
    setIsSending(true);

    let finalBody = body.trim();
    if (isConfidential) {
      finalBody = `🔒 [Confidential Message - Protected via GoldMailer]\n\n${finalBody}\n\n---\nThis email is protected by Confidential Mode. Unauthorized forwarding or copying is restricted.`;
    }
    if (attachedFiles.length > 0) {
      finalBody += `\n\n📎 [${attachedFiles.length} Attachment${attachedFiles.length > 1 ? 's' : ''}]: ${attachedFiles.map(a => a.name).join(', ')}`;
    }

    try {
      const sendRes = await sendEmail({
        to: fullTo.trim(),
        cc: getFullCcString().trim() || undefined,
        bcc: getFullBccString().trim() || undefined,
        subject: subject.trim() || '(No Subject)',
        body: finalBody,
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

  // Quick Emoji set
  const EMOJI_LIST = ['👍', '❤️', '😊', '🔥', '🎉', '👋', '🙏', '💯', '✨', '🚀', '⭐', '🤝', '💼', '📅', '💡', '✅'];

  return (
    <div
      className={`fixed z-50 transition-all duration-200 select-none ${
        isMinimized
          ? 'bottom-0 right-4 sm:right-8 w-72 sm:w-80 shadow-2xl z-50'
          : isFullscreen
          ? 'fixed inset-2 sm:inset-6 flex flex-col z-50'
          : 'fixed inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-4 sm:right-6 w-auto sm:w-[620px] max-w-[95vw] flex flex-col z-50'
      }`}
    >
      {/* Background Dimmer on Mobile if not minimized and not fullscreen */}
      {!isMinimized && !isFullscreen && (
        <div className="sm:hidden fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={handleClose} />
      )}

      {/* Main Gmail-style Window */}
      <div
        className={`relative bg-[#1c1d22] border border-white/10 rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-white z-10 backdrop-blur-2xl ring-1 ring-white/5 ${
          isMinimized
            ? 'h-11'
            : isFullscreen
            ? 'h-full rounded-2xl'
            : 'h-[85vh] sm:h-[600px]'
        }`}
      >
        {/* ================= 1. GMAIL HEADER BAR ================= */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#25262e] border-b border-white/10 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00] shadow-[0_0_8px_#FF6A00]" />
            <span className="text-xs font-bold text-white tracking-wide truncate">
              {subject.trim() ? subject.trim() : 'New Message'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            {/* Minimize */}
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            {/* Fullscreen */}
            <button
              type="button"
              onClick={() => {
                setIsMinimized(false);
                setIsFullscreen(!isFullscreen);
              }}
              className="p-1.5 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer hidden sm:block"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Save & Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Error Banner */}
            {error && (
              <div className="px-4 py-2 bg-red-500/15 border-b border-red-500/20 text-red-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Confidential Mode Active Banner */}
            {isConfidential && (
              <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-[11px] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Confidential Mode: Forwarding, copying & downloads restricted</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfidential(false)}
                  className="text-amber-400 hover:underline text-[10px]"
                >
                  Turn off
                </button>
              </div>
            )}

            {/* ================= 2. FROM SENDER ================= */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 text-xs bg-white/[0.01]">
              <span className="text-zinc-500 font-medium w-10">From</span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] text-[9px] font-bold flex items-center justify-center text-white">
                  {activeEmail.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-zinc-300 font-mono truncate">{activeEmail}</span>
              </div>
            </div>

            {/* ================= 3. TO RECIPIENTS (WITH CHIPS) ================= */}
            <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2 text-xs flex-wrap min-h-[38px]">
              <span className="text-zinc-500 font-medium w-10">To</span>

              {/* Chips */}
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {toChips.map((chip, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/30 text-xs font-mono"
                  >
                    <span>{chip}</span>
                    <button
                      type="button"
                      onClick={() => setToChips(prev => prev.filter((_, i) => i !== idx))}
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                <input
                  type="email"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={(e) => handleKeyDownRecipient(e, toInput, setToInput, toChips, setToChips)}
                  onBlur={() => {
                    if (toInput.trim()) {
                      const newEmails = parseEmailsToChips(toInput);
                      setToChips(prev => Array.from(new Set([...prev, ...newEmails])));
                      setToInput('');
                    }
                  }}
                  placeholder={toChips.length === 0 ? "Recipients (press Enter or comma)" : "Add more..."}
                  className="flex-1 min-w-[140px] bg-transparent text-xs text-white placeholder-zinc-500 outline-none font-mono py-1"
                />
              </div>

              {/* Cc / Bcc Toggles */}
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-shrink-0">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="hover:text-[#FF8C42] transition-colors"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="hover:text-[#FF8C42] transition-colors"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {/* ================= CC FIELD ================= */}
            {showCc && (
              <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2 text-xs flex-wrap">
                <span className="text-zinc-500 font-medium w-10">Cc</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {ccChips.map((chip, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-200 border border-white/10 text-xs font-mono"
                    >
                      <span>{chip}</span>
                      <button
                        type="button"
                        onClick={() => setCcChips(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => handleKeyDownRecipient(e, ccInput, setCcInput, ccChips, setCcChips)}
                    onBlur={() => {
                      if (ccInput.trim()) {
                        const newEmails = parseEmailsToChips(ccInput);
                        setCcChips(prev => Array.from(new Set([...prev, ...newEmails])));
                        setCcInput('');
                      }
                    }}
                    placeholder="Cc recipients..."
                    className="flex-1 min-w-[120px] bg-transparent text-xs text-white placeholder-zinc-500 outline-none font-mono py-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCc(false);
                    setCcChips([]);
                    setCcInput('');
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ================= BCC FIELD ================= */}
            {showBcc && (
              <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2 text-xs flex-wrap">
                <span className="text-zinc-500 font-medium w-10">Bcc</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {bccChips.map((chip, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-200 border border-white/10 text-xs font-mono"
                    >
                      <span>{chip}</span>
                      <button
                        type="button"
                        onClick={() => setBccChips(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    onKeyDown={(e) => handleKeyDownRecipient(e, bccInput, setBccInput, bccChips, setBccChips)}
                    onBlur={() => {
                      if (bccInput.trim()) {
                        const newEmails = parseEmailsToChips(bccInput);
                        setBccChips(prev => Array.from(new Set([...prev, ...newEmails])));
                        setBccInput('');
                      }
                    }}
                    placeholder="Bcc recipients..."
                    className="flex-1 min-w-[120px] bg-transparent text-xs text-white placeholder-zinc-500 outline-none font-mono py-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowBcc(false);
                    setBccChips([]);
                    setBccInput('');
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ================= 4. SUBJECT LINE ================= */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full bg-transparent text-sm font-semibold text-white placeholder-zinc-500 outline-none tracking-tight"
              />
            </div>

            {/* ================= 5. GMAIL RICH FORMATTING TOOLBAR ================= */}
            {showFormatting && (
              <div className="px-3 py-1.5 bg-[#17181c] border-b border-white/10 flex items-center gap-1 overflow-x-auto text-zinc-400 text-xs">
                {/* Undo / Redo */}
                <button
                  type="button"
                  onClick={() => applyTextFormat('undo')}
                  title="Undo"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('redo')}
                  title="Redo"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-white/10 mx-1" />

                {/* Font Selector */}
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="bg-[#24252c] text-zinc-200 text-[11px] rounded px-2 py-0.5 outline-none border border-white/10 cursor-pointer"
                >
                  <option value="sans">Sans Serif</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Monospace</option>
                </select>

                {/* Font Size */}
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  className="bg-[#24252c] text-zinc-200 text-[11px] rounded px-2 py-0.5 outline-none border border-white/10 cursor-pointer"
                >
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>

                <div className="h-4 w-px bg-white/10 mx-1" />

                {/* Bold, Italic, Underline, Strike */}
                <button
                  type="button"
                  onClick={() => applyTextFormat('b', 'bold')}
                  title="Bold (Ctrl+B)"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer font-bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('i', 'italic')}
                  title="Italic (Ctrl+I)"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('u', 'underline')}
                  title="Underline (Ctrl+U)"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer underline"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('s', 'strikethrough')}
                  title="Strikethrough"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-white/10 mx-1" />

                {/* Text Alignments */}
                <button
                  type="button"
                  onClick={() => setTextAlign('left')}
                  className={`p-1.5 rounded cursor-pointer ${textAlign === 'left' ? 'text-[#FF8C42] bg-white/10' : 'hover:text-white hover:bg-white/10'}`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTextAlign('center')}
                  className={`p-1.5 rounded cursor-pointer ${textAlign === 'center' ? 'text-[#FF8C42] bg-white/10' : 'hover:text-white hover:bg-white/10'}`}
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTextAlign('right')}
                  className={`p-1.5 rounded cursor-pointer ${textAlign === 'right' ? 'text-[#FF8C42] bg-white/10' : 'hover:text-white hover:bg-white/10'}`}
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-px bg-white/10 mx-1" />

                {/* Lists & Quote */}
                <button
                  type="button"
                  onClick={() => applyTextFormat('numbered', 'list item')}
                  title="Numbered List"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('bullet', 'list item')}
                  title="Bulleted List"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyTextFormat('quote', 'quote')}
                  title="Quote"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ================= 6. EMAIL BODY ================= */}
            <div className="flex-1 p-4 overflow-y-auto flex flex-col">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Write your email here... (Press Ctrl+Enter to send)"
                className={`w-full flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed ${
                  fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                } ${
                  fontSize === 'small' ? 'text-xs' : fontSize === 'large' ? 'text-base' : 'text-sm'
                } ${
                  textAlign === 'center' ? 'text-center' : textAlign === 'right' ? 'text-right' : 'text-left'
                }`}
              />

              {/* Attached Files Chips in body bottom */}
              {attachedFiles.length > 0 && (
                <div className="pt-3 border-t border-white/10 flex flex-wrap gap-2">
                  {attachedFiles.map((att) => (
                    <div
                      key={att.id}
                      className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2 text-xs text-zinc-300"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#FF8C42]" />
                      <span className="font-medium truncate max-w-[160px]">{att.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">({formatFileSize(att.size)})</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="text-zinc-500 hover:text-red-400 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden real file input */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* ================= 7. EMOJI DRAWER ================= */}
            {showEmojiPicker && (
              <div className="px-4 py-2 bg-[#17181c] border-t border-white/10 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] text-zinc-500 font-medium mr-1">Emojis:</span>
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setBody(prev => prev + em);
                      setShowEmojiPicker(false);
                    }}
                    className="text-base hover:scale-125 transition-transform cursor-pointer p-1"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* ================= 8. LINK MODAL ================= */}
            {showLinkModal && (
              <div className="mx-4 mb-2 p-3 bg-[#202127] border border-white/10 rounded-xl space-y-2.5 text-xs shadow-xl">
                <div className="flex items-center justify-between text-zinc-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#FF8C42]" /> Insert Link
                  </span>
                  <button type="button" onClick={() => setShowLinkModal(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Text to display (e.g. My Link)"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="bg-[#17181c] border border-white/10 rounded-lg px-2.5 py-1.5 text-white placeholder-zinc-500 outline-none text-xs"
                  />
                  <input
                    type="url"
                    placeholder="Web address (e.g. https://example.com)"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="bg-[#17181c] border border-white/10 rounded-lg px-2.5 py-1.5 text-white placeholder-zinc-500 outline-none text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(false)}
                    className="px-3 py-1 rounded-lg text-zinc-400 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertLink}
                    className="px-3 py-1 rounded-lg bg-[#FF6A00] hover:bg-[#FF8C42] text-white text-xs font-bold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* ================= 9. SCHEDULE SEND POPUP ================= */}
            {showSchedule && (
              <div className="mx-4 mb-2 p-3 bg-[#202127] border border-[#FF6A00]/30 rounded-xl space-y-2.5 text-xs shadow-2xl">
                <div className="flex items-center justify-between text-[#FF8C42] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Schedule dispatch
                  </span>
                  <button type="button" onClick={() => setShowSchedule(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSend(new Date(Date.now() + 10 * 60000).toISOString())}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium cursor-pointer"
                  >
                    In 10 mins
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(new Date(Date.now() + 60 * 60000).toISOString())}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium cursor-pointer"
                  >
                    In 1 hour
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      tomorrow.setHours(8, 0, 0, 0);
                      handleSend(tomorrow.toISOString());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium cursor-pointer"
                  >
                    Tomorrow morning (8:00 AM)
                  </button>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={customScheduleDate}
                    onChange={(e) => setCustomScheduleDate(e.target.value)}
                    className="bg-[#17181c] border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs outline-none flex-1"
                  />
                  <button
                    type="button"
                    disabled={!customScheduleDate}
                    onClick={() => handleSend(new Date(customScheduleDate).toISOString())}
                    className="px-3 py-1 bg-[#FF6A00] disabled:opacity-50 text-white rounded-lg font-bold text-xs cursor-pointer"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            )}

            {/* ================= 10. AUTHENTIC GMAIL ACTION BAR ================= */}
            <div className="px-4 py-2.5 pb-3 sm:pb-2.5 bg-[#17181c] border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
              {/* Left Side: Split Send Button + Formatting & Attachment Icons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Split Send Button */}
                <div className="inline-flex rounded-xl shadow-md overflow-hidden">
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSend()}
                    className="px-4 py-2 bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF6A00]/20"
                    title="Send (Ctrl+Enter)"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Sending...' : 'Send'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSchedule(!showSchedule)}
                    className="px-2 bg-[#FF8C42] hover:bg-[#FF6A00] text-white border-l border-black/20 transition-colors flex items-center justify-center cursor-pointer"
                    title="More send options (Schedule)"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Gmail-style Icon Buttons */}
                <div className="flex items-center gap-0.5 ml-1 text-zinc-400">
                  {/* Formatting Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowFormatting(!showFormatting)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      showFormatting ? 'text-[#FF8C42] bg-white/10' : 'hover:text-white hover:bg-white/5'
                    }`}
                    title="Formatting options"
                  >
                    <span className="font-serif font-black underline text-sm leading-none">A</span>
                  </button>

                  {/* Attach files */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Attach files"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {/* Insert Link */}
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(!showLinkModal)}
                    className="p-2 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Insert link"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>

                  {/* Insert Emoji */}
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Insert emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  {/* Insert Image */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Insert photo"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>

                  {/* Confidential Mode */}
                  <button
                    type="button"
                    onClick={() => setIsConfidential(!isConfidential)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      isConfidential ? 'text-amber-400 bg-amber-500/15' : 'hover:text-white hover:bg-white/5'
                    }`}
                    title="Toggle confidential mode"
                  >
                    <Lock className="w-4 h-4" />
                  </button>

                  {/* Signature */}
                  <button
                    type="button"
                    onClick={toggleSignature}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      hasSignature ? 'text-[#FF8C42] bg-white/10' : 'hover:text-white hover:bg-white/5'
                    }`}
                    title="Insert signature"
                  >
                    <PenTool className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Right Side: Draft Status & Discard */}
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 hidden sm:flex">
                  {isSavingDraft ? (
                    <span className="text-[#FF8C42] animate-pulse">Saving draft...</span>
                  ) : draftStatus ? (
                    <span>{draftStatus}</span>
                  ) : (
                    <span>Auto-saved to Drafts</span>
                  )}
                </div>

                <button
                  type="button"
                  title="Discard draft"
                  onClick={handleDiscard}
                  className="p-2 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
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
