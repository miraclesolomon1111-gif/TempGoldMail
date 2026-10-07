import React, { useState } from 'react';
import { X, Lock, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';

interface PasswordUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailAddress: string;
  onUnlock: (password: string) => Promise<void>;
}

export const PasswordUnlockModal: React.FC<PasswordUnlockModalProps> = ({
  isOpen,
  onClose,
  emailAddress,
  onUnlock
}) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter password');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await onUnlock(password.trim());
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Incorrect password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2 text-[#fbbc04]">
            <Lock className="w-5 h-5" />
            <span className="text-sm font-medium text-white">Protected Mailbox</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#c4c7c5] hover:text-white rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#8e918f] mt-1 leading-relaxed">
          The address <span className="text-white font-mono">{emailAddress}</span> is password-locked. Enter the owner password to access this inbox.
        </p>

        {error && (
          <div className="mt-3 p-2.5 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3 py-2.5">
              <KeyRound className="w-4 h-4 text-[#8e918f] mr-2 flex-shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter mailbox password"
                className="w-full bg-transparent text-white text-xs outline-none"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <span>{isLoading ? 'Verifying...' : 'Unlock & Open Inbox'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
