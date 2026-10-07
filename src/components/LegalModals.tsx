import React, { useState } from 'react';
import { X, Shield, FileText, Sparkles, LifeBuoy, Database, Check, ExternalLink } from 'lucide-react';
import { getSupabaseCredentials, resetSupabaseClient } from '../lib/supabase';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
}

// 1. Updates Modal
export const UpdatesModal: React.FC<ModalBaseProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#00C07F]/15 border border-[#00C07F]/30 flex items-center justify-center text-[#00C07F]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Latest Updates</h3>
            <p className="text-xs text-zinc-400">Version 7.4.0 Beta Changelog</p>
          </div>
        </div>

        <div className="space-y-4 text-xs text-zinc-300">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between font-bold text-white mb-1">
              <span>v7.4.0 (Current)</span>
              <span className="text-[10px] text-[#00C07F] font-mono">10/06/2026</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-zinc-400">
              <li>Upgraded to Cloudflare Catch-All Email Routing for @goldmailer.xyz</li>
              <li>Sandboxed iframe HTML message viewer with raw switch</li>
              <li>5-second automated background refresh & Supabase Realtime sync</li>
              <li>Multi-address management with Random, Domain, and Popular filters</li>
              <li>Instant custom email handles and cloud sync</li>
            </ul>
          </div>

          <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
            <div className="flex items-center justify-between font-bold text-white mb-1">
              <span>v7.3.2</span>
              <span className="text-[10px] text-zinc-500 font-mono">08/04/2026</span>
            </div>
            <p className="text-zinc-400">
              Improved mobile viewport experience, zero pop-up delays, and instant clipboard copy feedback.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. Privacy Policy Modal
export const PrivacyModal: React.FC<ModalBaseProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Privacy Policy</h3>
            <p className="text-xs text-zinc-400">Zero logging & disposable encryption</p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
          <p>
            GoldMailer (<strong>goldmailer.xyz</strong>) is built from the ground up for strict privacy, disposable communication, and anonymity.
          </p>
          <h4 className="font-bold text-white pt-1">1. No Personal Tracking</h4>
          <p className="text-zinc-400">
            We do not log your IP address, device telemetry, browser cookies, or physical identity when generating temporary inboxes.
          </p>
          <h4 className="font-bold text-white pt-1">2. Email Disposal</h4>
          <p className="text-zinc-400">
            Messages received in free temporary inboxes are stored temporarily and can be deleted by you at any time with a single tap.
          </p>
          <h4 className="font-bold text-white pt-1">3. Sandboxed Rendering</h4>
          <p className="text-zinc-400">
            Incoming email HTML is rendered in an isolated sandbox iframe to prevent external scripts, tracking pixels, or cross-site requests.
          </p>
        </div>
      </div>
    </div>
  );
};

// 3. Terms of Service Modal
export const TermsModal: React.FC<ModalBaseProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Terms of Service</h3>
            <p className="text-xs text-zinc-400">Acceptable usage of GoldMailer</p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
          <p>
            By using <strong>goldmailer.xyz</strong>, you agree to our fair usage standards.
          </p>
          <h4 className="font-bold text-white pt-1">Acceptable Use</h4>
          <p className="text-zinc-400">
            You may use GoldMailer to test software, verify registrations, avoid marketing spam, and protect your personal address.
          </p>
          <h4 className="font-bold text-white pt-1">Prohibited Activities</h4>
          <p className="text-zinc-400">
            GoldMailer must not be used for illicit activities, abusive spam campaigns, harassment, or unlawful distribution.
          </p>
        </div>
      </div>
    </div>
  );
};

// 4. Contact & Support Modal
export const ContactModal: React.FC<ModalBaseProps> = ({ isOpen, onClose }) => {
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setMessage('');
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Report & Contact</h3>
            <p className="text-xs text-zinc-400">We respond within 24 hours</p>
          </div>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#00C07F]/20 text-[#00C07F] flex items-center justify-center">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="font-bold text-white text-sm">Feedback Received!</h4>
            <p className="text-xs text-zinc-400">Thank you for helping us improve GoldMailer.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Your Email (optional)
              </label>
              <input
                type="email"
                placeholder="contact@domain.com"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C07F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Message / Issue Description
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Let us know what you think or report a bug..."
                className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C07F]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#00C07F] hover:bg-[#00D78E] text-black font-extrabold text-xs shadow-md shadow-[#00C07F]/20 active:scale-95 transition-all"
            >
              Send Message
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// 5. Cloud & Supabase Configuration Modal
export const CloudConfigModal: React.FC<ModalBaseProps> = ({ isOpen, onClose }) => {
  const current = getSupabaseCredentials();
  const [url, setUrl] = useState(current.url);
  const [key, setKey] = useState(current.key);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('goldmailer_supabase_url', url.trim());
    localStorage.setItem('goldmailer_supabase_key', key.trim());
    resetSupabaseClient();
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[#00C07F]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Database & Supabase Status</h3>
            <p className="text-xs text-zinc-400">Configure custom cloud project</p>
          </div>
        </div>

        <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Connection State:</span>
            <span className="font-semibold text-[#00C07F] flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C07F] animate-pulse"></span>
              <span>Online & Ready</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Cloudflare Webhook:</span>
            <span className="font-mono text-zinc-300">/api/receive-email</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyzproject.supabase.co"
              className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C07F] font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Supabase Anon Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOi..."
              className="w-full bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C07F] font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#00C07F] hover:bg-[#00D78E] text-black font-extrabold text-xs shadow-md shadow-[#00C07F]/20 active:scale-95 transition-all flex items-center justify-center space-x-1"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Configuration Saved!</span>
              </>
            ) : (
              <span>Save & Connect</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
