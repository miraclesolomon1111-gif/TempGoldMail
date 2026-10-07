import React, { useState, useRef } from 'react';
import {
  X,
  Sparkles,
  Lock,
  Camera,
  ShieldCheck,
  Check,
  AlertCircle,
  HelpCircle,
  KeyRound
} from 'lucide-react';
import { generateRandomEmail, formatCustomEmail, PRIMARY_DOMAIN } from '../lib/emailGenerator';

interface CustomEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: import('../types').UserProfile | null;
  onCreate: (data: {
    emailAddress: string;
    isCustom: boolean;
    password?: string;
    avatarUrl?: string;
    isReserved?: boolean;
  }) => Promise<void>;
  onOpenReservePayment: (emailAddress: string) => void;
}

export const CustomEmailModal: React.FC<CustomEmailModalProps> = ({
  isOpen,
  onClose,
  user,
  onCreate,
  onOpenReservePayment
}) => {
  const [handle, setHandle] = useState('');
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [planType, setPlanType] = useState<'free' | 'reserve'>('free');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentPreviewEmail = formatCustomEmail(handle || 'myname');

  const handleGenerateRandom = () => {
    const random = generateRandomEmail();
    const prefix = random.split('@')[0];
    setHandle(prefix);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAvatarUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalEmail = formatCustomEmail(handle || 'user');

    if (enablePassword && !password.trim()) {
      setError('Please provide a password to protect this mailbox.');
      return;
    }

    // Enforce: Users cannot add password to custom email without upgrading!
    if (enablePassword && !user?.isPremium && planType !== 'reserve') {
      setError('You must upgrade to GoldMail Pro ($1.11 / year) before adding a password to custom emails.');
      return;
    }

    if (planType === 'reserve') {
      // Directs to NOWPayments flow for $1.11 / year
      onClose();
      onOpenReservePayment(finalEmail);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onCreate({
        emailAddress: finalEmail,
        isCustom: true,
        password: enablePassword && user?.isPremium ? password.trim() : undefined,
        avatarUrl: avatarUrl || undefined,
        isReserved: false
      });
      onClose();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('JSON') || msg.includes('token') || msg.includes('Unexpected')) {
        setError('Server is updating. Address created locally; syncing momentarily.');
      } else {
        setError(msg || 'Failed to create email');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <h2 className="text-base font-medium text-white">Create GoldMail Address</h2>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Custom handle input */}
          <div>
            <label className="block text-xs font-medium text-[#8e918f] mb-1">
              Choose your address handle
            </label>
            <div className="flex items-center rounded-2xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] overflow-hidden px-3.5 py-2.5">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="e.g. anything, miracle, business"
                className="flex-1 bg-transparent text-white outline-none text-sm font-mono"
              />
              <span className="text-[#8ab4f8] text-xs font-mono select-none">
                @{PRIMARY_DOMAIN}
              </span>
            </div>
          </div>

          {/* Random generator button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerateRandom}
              className="flex items-center gap-1.5 text-xs text-[#8ab4f8] hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#fbbc04]" />
              <span>Generate random name</span>
            </button>
          </div>

          {/* Picture / Avatar Upload */}
          <div>
            <label className="block text-xs font-medium text-[#8e918f] mb-1">
              Email Avatar Picture (Optional)
            </label>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Custom Avatar"
                  className="w-12 h-12 rounded-full object-cover border border-[#8ab4f8]"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#121212] border border-[#303134] flex items-center justify-center text-[#8e918f]">
                  <Camera className="w-5 h-5" />
                </div>
              )}
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-[#2d2f31] hover:bg-[#3c4043] text-xs text-white transition-colors"
                >
                  Upload Picture
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <p className="text-[11px] text-[#8e918f] mt-1">
                  Shown in your inbox and account switcher
                </p>
              </div>
            </div>
          </div>

          {/* Plan Choice (Free Temp vs Reserve Forever $1.11/yr) */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPlanType('free')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                planType === 'free'
                  ? 'border-[#8ab4f8] bg-[#8ab4f8]/10 text-white'
                  : 'border-[#303134] bg-[#121212] text-[#8e918f] hover:border-zinc-700'
              }`}
            >
              <div className="text-xs font-medium text-white mb-0.5">Free Temporary</div>
              <div className="text-[11px] text-[#8e918f]">Standard disposable mailbox</div>
            </button>

            <button
              type="button"
              onClick={() => setPlanType('reserve')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                planType === 'reserve'
                  ? 'border-[#fbbc04] bg-[#fbbc04]/10 text-white'
                  : 'border-[#303134] bg-[#121212] text-[#8e918f] hover:border-zinc-700'
              }`}
            >
              <div className="text-xs font-medium text-[#fbbc04] flex items-center justify-between mb-0.5">
                <span>Reserve Forever</span>
                <span className="text-[10px] font-bold bg-[#fbbc04]/20 px-1 rounded">$1.11/yr</span>
              </div>
              <div className="text-[11px] text-[#8e918f]">Lock exclusively with password</div>
            </button>
          </div>

          {/* Password Protection Toggle */}
          <div className="pt-1">
            <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-[#121212] border border-[#303134]">
              <div className="flex items-center gap-2.5">
                <Lock className={`w-4 h-4 ${user?.isPremium || planType === 'reserve' ? 'text-[#8ab4f8]' : 'text-[#fbbc04]'}`} />
                <div>
                  <div className="text-xs font-medium text-white flex items-center gap-1.5">
                    <span>Password Protect Mailbox</span>
                    {!user?.isPremium && (
                      <span className="text-[10px] bg-amber-500/20 text-[#fbbc04] font-semibold px-1.5 py-0.2 rounded">
                        PRO ($1.11/yr)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#8e918f]">
                    {user?.isPremium
                      ? 'Requires password to access or recreate'
                      : 'Must upgrade to Pro ($1.11/year) before adding password'}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enablePassword}
                onChange={(e) => {
                  setEnablePassword(e.target.checked);
                  if (e.target.checked && !user?.isPremium) {
                    setPlanType('reserve');
                  }
                }}
                className="w-4 h-4 accent-[#0b57d0]"
              />
            </label>

            {enablePassword && !user?.isPremium && planType !== 'reserve' && (
              <div className="mt-2.5 p-3 rounded-xl bg-[#fbbc04]/10 border border-[#fbbc04]/30 text-xs text-[#fbbc04] flex flex-col gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <span>Upgrade Required Before Adding Password</span>
                </div>
                <p className="text-[11px] text-zinc-300">
                  Users cannot add a password to customer emails without upgrading. Please upgrade to GoldMail Pro ($1.11 / year) to lock and reserve this address.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPlanType('reserve');
                    onClose();
                    onOpenReservePayment(currentPreviewEmail);
                  }}
                  className="mt-1 py-1.5 px-3 rounded-lg bg-[#fbbc04] hover:bg-[#e0a800] text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upgrade to Set Password ($1.11 / yr)</span>
                </button>
              </div>
            )}

            {enablePassword && (user?.isPremium || planType === 'reserve') && (
              <div className="mt-2.5 space-y-1.5">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set mailbox secret password"
                  className="w-full bg-[#121212] text-white border border-[#303134] focus:border-[#8ab4f8] rounded-xl px-3.5 py-2 text-xs outline-none"
                  required
                />
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Password protection will be locked to this custom address</span>
                </p>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-2xl font-medium text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                planType === 'reserve'
                  ? 'bg-[#fbbc04] text-zinc-900 hover:bg-[#e0a800]'
                  : 'bg-[#0b57d0] text-white hover:bg-[#1a73e8]'
              }`}
            >
              {isLoading ? (
                <span>Creating address...</span>
              ) : planType === 'reserve' ? (
                <span>Proceed to Reserve for $1.11 / yr</span>
              ) : (
                <span>Create Mailbox</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
