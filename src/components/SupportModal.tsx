import React, { useState } from 'react';
import { X, HelpCircle, Send, MessageSquare, Check, Sparkles, Shield, Mail } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, userEmail }) => {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'support'; text: string; time: string }>>([
    {
      sender: 'support',
      text: 'Hello! Welcome to GoldMail Support. How can we help you with your temporary emails or domain settings on goldmailer.xyz today?',
      time: 'Just now'
    }
  ]);

  if (!isOpen) return null;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userText = question.trim();
    setMessages(prev => [
      ...prev,
      { sender: 'user', text: userText, time: 'Just now' }
    ]);
    setQuestion('');

    // Dynamic responsive support answers
    setTimeout(() => {
      let reply = "Thank you for reaching out! Our team has logged your inquiry. If you are experiencing email delivery delays, please verify your sender MX/SPF records or check that your recipient is formatted as anything@goldmailer.xyz.";
      const lower = userText.toLowerCase();
      if (lower.includes('reserve') || lower.includes('1.11') || lower.includes('premium')) {
        reply = "To reserve any custom address forever for $1.11/year, tap 'Reserve Email Forever' in your account switcher. You can pay via USDT, BTC, ETH, SOL, or LTC using NOWPayments, and lock it with your secret password!";
      } else if (lower.includes('resend') || lower.includes('webhook')) {
        reply = "GoldMail automatically connects to Resend and Cloudflare Email Routing catch-all workers on goldmailer.xyz. Any incoming email to your handle arrives in real time.";
      } else if (lower.includes('password') || lower.includes('lock')) {
        reply = "When creating an address, check 'Password Protect Mailbox'. Once set, nobody can view or recreate that email address without providing your password.";
      }
      setMessages(prev => [
        ...prev,
        { sender: 'support', text: reply, time: 'Just now' }
      ]);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#8ab4f8]" />
            <h2 className="text-base font-medium text-white">Help & Feedback</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat message history */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1 scrollbar-thin">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-[#0b57d0] text-white rounded-br-xs'
                    : 'bg-[#2d2f31] text-[#e3e3e3] rounded-bl-xs border border-white/5'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[10px] text-[#8e918f] mt-1 px-1">{m.time}</span>
            </div>
          ))}
        </div>

        {/* Input box */}
        <form onSubmit={handleSendMessage} className="pt-3 border-t border-[#303134] flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question or issue..."
            className="flex-1 bg-[#121212] border border-[#303134] focus:border-[#8ab4f8] rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
          />
          <button
            type="submit"
            className="p-2.5 bg-[#0b57d0] hover:bg-[#1a73e8] text-white rounded-full transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
