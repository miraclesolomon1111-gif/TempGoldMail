import React, { useState } from 'react';
import {
  X,
  Send,
  Clock,
  Paperclip,
  MoreVertical,
  ChevronDown,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { TempEmail } from '../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableFromEmails: TempEmail[];
  activeEmail: string;
  onSend: (data: {
    from: string;
    to: string;
    subject: string;
    text: string;
    scheduledFor?: string;
  }) => Promise<void>;
  initialTo?: string;
  initialSubject?: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  availableFromEmails,
  activeEmail,
  onSend,
  initialTo = '',
  initialSubject = ''
}) => {
  const [from, setFrom] = useState(activeEmail || availableFromEmails[0]?.email_address || 'custom@goldmailer.xyz');
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (scheduleDate?: string) => {
    if (!to.trim()) {
      setError('Please enter a recipient email address.');
      return;
    }
    setError(null);
    setIsSending(true);
    try {
      await onSend({
        from: from || activeEmail,
        to: to.trim(),
        subject: subject.trim(),
        text: text.trim(),
        scheduledFor: scheduleDate || (scheduledTime ? new Date(scheduledTime).toISOString() : undefined)
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch email');
    } finally {
      setIsSending(false);
    }
  };

  // Helper quick schedules
  const handleQuickSchedule = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
    handleSubmit(d.toISOString());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Compose Window */}
      <div className="relative w-full max-w-2xl bg-[#1e1f20] text-[#e3e3e3] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col z-10 overflow-hidden border border-[#303134] h-[85vh] sm:h-[650px] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#303134]">
          <span className="text-[15px] font-medium text-white">Compose</span>
          <div className="flex items-center gap-2">
            {/* Slow Reply / Schedule Send Toggle */}
            <button
              onClick={() => setShowSchedulePicker(!showSchedulePicker)}
              title="Schedule Send / Slow Reply"
              className={`p-2 rounded-full hover:bg-white/10 transition-colors ${
                showSchedulePicker ? 'text-[#8ab4f8] bg-white/10' : 'text-[#c4c7c5]'
              }`}
            >
              <Clock className="w-4.5 h-4.5" />
            </button>

            {/* Send Button */}
            <button
              onClick={() => handleSubmit()}
              disabled={isSending}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0b57d0] hover:bg-[#1a73e8] text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10 transition-colors ml-1"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Schedule Picker Bar (if opened) */}
        {showSchedulePicker && (
          <div className="bg-[#2d2f31] px-5 py-2.5 border-b border-[#303134] flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#8ab4f8] font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Schedule Send:</span>
            </span>
            <button
              onClick={() => handleQuickSchedule(15)}
              className="px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-white/10 text-white transition-colors"
            >
              In 15 mins
            </button>
            <button
              onClick={() => handleQuickSchedule(60)}
              className="px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-white/10 text-white transition-colors"
            >
              In 1 hour
            </button>
            <button
              onClick={() => handleQuickSchedule(1440)}
              className="px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-white/10 text-white transition-colors"
            >
              Tomorrow
            </button>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="bg-[#1e1f20] text-white px-2 py-1 rounded text-xs outline-none border border-white/10"
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-500/15 border-b border-red-500/30 px-5 py-2 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Fields */}
        <div className="divide-y divide-[#303134] text-sm">
          {/* From */}
          <div className="flex items-center px-5 py-2.5 gap-3">
            <span className="text-[#8e918f] w-14">From</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 bg-transparent text-white outline-none cursor-pointer font-mono text-xs"
            >
              {availableFromEmails.map((item) => (
                <option key={item.id} value={item.email_address} className="bg-[#1e1f20] text-white">
                  {item.email_address}
                </option>
              ))}
              {!availableFromEmails.length && (
                <option value={activeEmail || 'custom@goldmailer.xyz'} className="bg-[#1e1f20] text-white">
                  {activeEmail || 'custom@goldmailer.xyz'}
                </option>
              )}
            </select>
          </div>

          {/* To */}
          <div className="flex items-center px-5 py-2.5 gap-3">
            <span className="text-[#8e918f] w-14">To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Recipient email address (e.g. user@gmail.com)"
              className="flex-1 bg-transparent text-white outline-none placeholder-[#5f6368] font-mono text-xs"
            />
          </div>

          {/* Subject */}
          <div className="flex items-center px-5 py-2.5 gap-3">
            <span className="text-[#8e918f] w-14">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-white outline-none placeholder-[#5f6368]"
            />
          </div>
        </div>

        {/* Message body */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Compose email..."
            className="w-full flex-1 bg-transparent text-white outline-none placeholder-[#5f6368] resize-none text-sm font-sans leading-relaxed"
          />
        </div>

        {/* Bottom bar */}
        <div className="px-5 py-3 border-t border-[#303134] bg-[#1a1b1c] flex items-center justify-between text-xs text-[#8e918f]">
          <span>Sent from GoldMail &bull; goldmailer.xyz</span>
          <button
            onClick={() => handleSubmit()}
            disabled={isSending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{scheduledTime ? 'Schedule Send' : 'Send'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
