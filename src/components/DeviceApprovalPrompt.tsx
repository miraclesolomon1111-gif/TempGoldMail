import React, { useState, useEffect } from 'react';
import { ShieldAlert, MapPin, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { LoginAttempt } from '../types';
import { getPendingLoginAttempts, respondToLoginAttempt } from '../lib/api';

export const DeviceApprovalPrompt: React.FC = () => {
  const [pendingAttempts, setPendingAttempts] = useState<LoginAttempt[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<LoginAttempt | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Poll for pending attempts on active session every 4 seconds
  useEffect(() => {
    const checkPending = async () => {
      try {
        const attempts = await getPendingLoginAttempts();
        if (attempts && attempts.length > 0) {
          setPendingAttempts(attempts);
          setActiveAttempt(attempts[0]);
        } else {
          setActiveAttempt(null);
        }
      } catch {}
    };

    checkPending();
    const interval = setInterval(checkPending, 4000);
    return () => clearInterval(interval);
  }, []);

  if (!activeAttempt) return null;

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await respondToLoginAttempt(activeAttempt.id, 'approve');
      setFeedback('You approved this login attempt. The other device is now unlocked.');
      setTimeout(() => {
        setActiveAttempt(null);
        setFeedback(null);
      }, 3000);
    } catch (e: any) {
      alert(e.message || 'Failed to approve');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBlock = async () => {
    setIsProcessing(true);
    try {
      await respondToLoginAttempt(activeAttempt.id, 'block');
      setFeedback('Login blocked and IP restricted. Your GoldMailer account is safe.');
      setTimeout(() => {
        setActiveAttempt(null);
        setFeedback(null);
      }, 3000);
    } catch (e: any) {
      alert(e.message || 'Failed to block');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-[#18191c]/95 border-2 border-[#FF6A00] rounded-2xl shadow-2xl p-5 backdrop-blur-xl text-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00] flex-shrink-0">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white tracking-tight">Confirm login from your other device</h4>
            <p className="text-xs text-zinc-300 mt-1">
              Someone is trying to login to your GoldMailer account <strong>{activeAttempt.email}</strong> from:
            </p>
            <div className="mt-2 p-2.5 bg-black/40 rounded-xl border border-white/10 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-[#FF8C42]">
                <MapPin className="w-3.5 h-3.5" />
                <span>{activeAttempt.location || 'Berlin, Germany'}</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {activeAttempt.device_name} · IP: {activeAttempt.ip}
              </p>
            </div>

            {feedback ? (
              <p className="mt-3 text-xs font-semibold text-emerald-400">{feedback}</p>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleApprove}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 transition-all"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Yes, it's me
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleBlock}
                  className="py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  No, block it
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
