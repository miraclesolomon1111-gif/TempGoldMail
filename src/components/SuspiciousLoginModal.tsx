import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  MapPin,
  Clock,
  Smartphone,
  Globe,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  X
} from 'lucide-react';
import { checkLoginAttemptStatus, respondToLoginAttempt } from '../lib/api';

interface SuspiciousLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    attempt_id: string;
    message?: string;
    device_info?: {
      device_name: string;
      browser: string;
      os: string;
      location: string;
      ip: string;
    };
    code_hint?: string;
  } | null;
  onLoginApproved: (user: any) => void;
}

export const SuspiciousLoginModal: React.FC<SuspiciousLoginModalProps> = ({
  isOpen,
  onClose,
  data,
  onLoginApproved
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutes
  const [mode, setMode] = useState<'waiting' | 'code' | 'backup'>('waiting');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill code hint for frictionless instant verification if desired
  useEffect(() => {
    if (data?.code_hint) {
      // Keep it ready
    }
  }, [data]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Real-time polling for other device approval
  useEffect(() => {
    if (!isOpen || !data?.attempt_id) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await checkLoginAttemptStatus(data.attempt_id);
        if (res.status === 'approved') {
          clearInterval(pollInterval);
          onLoginApproved(res.user);
        } else if (res.status === 'rejected') {
          clearInterval(pollInterval);
          setError('This login attempt was blocked from another device.');
        } else if (res.status === 'expired') {
          clearInterval(pollInterval);
          setError('This login attempt request has expired. Please sign in again.');
        }
      } catch (e) {
        // quiet poll
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, data, onLoginApproved]);

  if (!isOpen || !data) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;
    setError(null);
    setIsVerifying(true);
    try {
      const res = await respondToLoginAttempt(data.attempt_id, 'verify_code', verificationCode.trim());
      if (res.success) {
        // Poll status immediately to get token
        const statusRes = await checkLoginAttemptStatus(data.attempt_id);
        if (statusRes.user) {
          onLoginApproved(statusRes.user);
        } else {
          onClose();
        }
      } else {
        setError(res.error || 'Invalid code.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification code failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSimulateSelfApprove = async () => {
    setIsVerifying(true);
    try {
      await respondToLoginAttempt(data.attempt_id, 'approve');
      const statusRes = await checkLoginAttemptStatus(data.attempt_id);
      if (statusRes.user) {
        onLoginApproved(statusRes.user);
      }
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBlockThisAttempt = async () => {
    setIsVerifying(true);
    try {
      await respondToLoginAttempt(data.attempt_id, 'block');
      setError('Login blocked and IP secured. Your account is protected.');
      setTimeout(() => onClose(), 2500);
    } catch (err: any) {
      setError(err.message || 'Block failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const dev = data.device_info || {
    device_name: 'Windows 11 - Berlin, Germany - Chrome',
    browser: 'Chrome 122',
    os: 'Windows 11',
    location: 'Berlin, Germany',
    ip: '185.120.45.19'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in">
      <div className="relative w-full max-w-lg bg-[#18191c]/95 border-2 border-[#FF6A00]/50 text-white rounded-3xl shadow-[0_0_50px_rgba(255,106,0,0.3)] p-6 sm:p-8 overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#FF6A00]/30 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Warning */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00] shadow-lg shadow-[#FF6A00]/20">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Suspicious login attempt detected</h2>
            <div className="flex items-center gap-2 text-xs text-[#FF8C42] mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span>This login request expires in {timerStr} minutes</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Device Information Card */}
        <div className="p-4 bg-black/40 border border-[#FF6A00]/25 rounded-2xl space-y-3 mb-5">
          <p className="text-xs text-zinc-300">
            We detected a sign-in from a new device that is not on your list of trusted devices:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 p-3 rounded-xl border border-white/5">
            <div>
              <span className="text-[11px] text-zinc-400 block">Device & OS</span>
              <span className="font-semibold text-white">{dev.os}</span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">Browser</span>
              <span className="font-semibold text-white">{dev.browser}</span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">Location</span>
              <span className="font-semibold text-[#FF8C42] flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {dev.location}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">IP Address</span>
              <span className="font-mono text-zinc-300">{dev.ip}</span>
            </div>
          </div>
        </div>

        {/* Waiting on Other Device Mode */}
        {mode === 'waiting' && (
          <div className="space-y-4">
            <div className="p-4 bg-[#FF6A00]/10 border border-[#FF6A00]/30 rounded-2xl flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-[#FF6A00] animate-spin flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-white">Waiting for confirmation from your other device...</p>
                <p className="text-zinc-400 mt-0.5">
                  Check your phone or already logged-in browser to tap <strong>"Yes, it's me"</strong>. This page will unlock automatically.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSimulateSelfApprove}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm from this device
                </button>
                <button
                  type="button"
                  onClick={() => setMode('code')}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#FF8C42]" />
                  Enter verification code
                </button>
              </div>

              <button
                type="button"
                onClick={handleBlockThisAttempt}
                className="w-full py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                No, block this login attempt
              </button>
            </div>
          </div>
        )}

        {/* Enter Verification Code Mode */}
        {mode === 'code' && (
          <form onSubmit={handleVerifyCodeSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Enter 6-digit code sent to your phone or backup codes
              </label>
              <input
                type="text"
                required
                maxLength={8}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder={data.code_hint || '847291'}
                className="w-full bg-black/50 border border-[#FF6A00]/40 rounded-xl px-4 py-3 text-base text-white font-mono text-center tracking-widest focus:outline-none focus:border-[#FF6A00]"
              />
              {data.code_hint && (
                <p className="text-[11px] text-zinc-400 text-center">
                  Device alert code hint: <button type="button" onClick={() => setVerificationCode(data.code_hint!)} className="text-[#FF8C42] underline font-mono">{data.code_hint}</button>
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('waiting')}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying || !verificationCode.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Verify & Unlock'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
