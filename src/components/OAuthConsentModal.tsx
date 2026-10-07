import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  X,
  ExternalLink,
  Lock,
  Mail,
  User,
  AlertCircle
} from 'lucide-react';
import { authorizeOAuthConsent } from '../lib/api';
import { UserProfile } from '../types';

interface OAuthConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  appName?: string;
  user: UserProfile | null;
}

export const OAuthConsentModal: React.FC<OAuthConsentModalProps> = ({
  isOpen,
  onClose,
  clientId,
  redirectUri,
  scope = 'openid email profile',
  state = '',
  appName = 'External Web Application',
  user
}) => {
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAllow = async () => {
    setIsApproving(true);
    setError(null);
    try {
      const res = await authorizeOAuthConsent({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state
      });

      if (res.redirect_url) {
        window.location.href = res.redirect_url;
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#18191c]/95 border-2 border-[#FF6A00]/40 text-white rounded-3xl shadow-2xl p-6 sm:p-7 overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-[#FF6A00]/25 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white text-sm">
              G
            </div>
            <span className="text-sm font-bold text-white">Sign in with GoldMailer</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="text-center space-y-1.5">
            <h3 className="text-base font-bold text-white">
              {appName} wants to access your GoldMailer account
            </h3>
            <p className="text-xs text-zinc-400">
              This will allow the app to confirm your identity and permanent email address.
            </p>
          </div>

          {/* User Pill */}
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-semibold text-white text-sm">
              {(user?.first_name || user?.username || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.username}
              </p>
              <p className="text-[11px] font-mono text-[#FF8C42] truncate">
                {user?.email || 'miracle@goldmailer.xyz'}
              </p>
            </div>
          </div>

          {/* Permissions requested */}
          <div className="space-y-2 text-xs">
            <p className="text-zinc-400 font-medium">Permissions requested:</p>
            <div className="space-y-1.5">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#FF6A00]" />
                <div>
                  <p className="font-semibold text-white">View your permanent email address</p>
                  <p className="text-[11px] text-zinc-400">Allows receiving communications & account binding</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                <User className="w-4 h-4 text-[#FF8C42]" />
                <div>
                  <p className="font-semibold text-white">View your basic profile</p>
                  <p className="text-[11px] text-zinc-400">Name and username associated with GoldMailer</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApproving}
              onClick={handleAllow}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isApproving ? 'Authorizing...' : 'Allow & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
