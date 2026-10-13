import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  X,
  ExternalLink,
  Lock,
  Mail,
  User,
  AlertCircle,
  Check,
  UserPlus
} from 'lucide-react';
import { authorizeOAuthConsent, getStoredAccounts, getAuthToken, StoredAccount } from '../lib/api';
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
  const [validatedName, setValidatedName] = useState<string>(appName);
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [isClientValid, setIsClientValid] = useState<boolean>(false);

  // Multi-account selection state
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<StoredAccount | null>(null);

  // Load client validity and multi accounts
  useEffect(() => {
    if (!isOpen || !clientId) return;

    let isMounted = true;
    setIsValidating(true);
    setError(null);

    // 1. Validate client
    const checkClient = async () => {
      try {
        const query = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri || ''
        });
        const res = await fetch(`/api/oauth/validate?${query.toString()}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.valid && data.client) {
          setIsClientValid(true);
          setValidatedName(data.client.app_name || appName);
        } else {
          setIsClientValid(false);
          setError(data.error || 'Invalid client_id or unauthorized redirect_uri');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setIsClientValid(false);
        setError(err.message || 'Failed to validate client_id');
      } finally {
        if (isMounted) setIsValidating(false);
      }
    };

    // 2. Fetch multi accounts (from localStorage + server device sync)
    const loadAccounts = async () => {
      const localAccs = getStoredAccounts();
      const combinedMap = new Map<string, StoredAccount>();

      // Seed from currently logged in user prop
      if (user) {
        combinedMap.set(user.email.toLowerCase(), {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user.name || user.username),
          token: ''
        });
      }

      // Add local stored accounts logged in on this device
      for (const a of localAccs) {
        if (a && a.email) {
          combinedMap.set(a.email.toLowerCase(), a);
        }
      }

      // Sync and enrich from server via IP address sync & device sync
      try {
        const token = getAuthToken();
        const localEmails = Array.from(combinedMap.keys());
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (localEmails.length > 0) headers['X-Device-Accounts'] = JSON.stringify(localEmails);

        const res = await fetch(`/api/oauth/accounts${localEmails.length > 0 ? `?emails=${encodeURIComponent(localEmails.join(','))}` : ''}`, { headers });
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          for (const sAcc of data.accounts) {
            const existing = combinedMap.get(sAcc.email.toLowerCase());
            if (existing) {
              combinedMap.set(sAcc.email.toLowerCase(), {
                ...existing,
                id: sAcc.id || existing.id,
                name: sAcc.name || existing.name,
                username: sAcc.username || existing.username,
                avatar_url: sAcc.avatar_url || existing.avatar_url
              });
            } else if (localAccs.some(la => la.email.toLowerCase() === sAcc.email.toLowerCase())) {
              combinedMap.set(sAcc.email.toLowerCase(), {
                id: sAcc.id,
                email: sAcc.email,
                username: sAcc.username,
                name: sAcc.name || sAcc.username,
                token: ''
              });
            }
          }
        }
      } catch {}

      const allAccounts = Array.from(combinedMap.values());
      if (isMounted) {
        setAccounts(allAccounts);
        if (allAccounts.length > 0) {
          // Select matching active email or default to first
          const currentEmail = user?.email?.toLowerCase();
          const found = allAccounts.find(a => a.email.toLowerCase() === currentEmail);
          setSelectedAccount(found || allAccounts[0]);
        } else {
          setSelectedAccount(null);
        }
      }
    };

    checkClient();
    loadAccounts();

    return () => {
      isMounted = false;
    };
  }, [isOpen, clientId, redirectUri, appName, user]);

  if (!isOpen) return null;

  const handleAllow = async () => {
    if (!isClientValid || !selectedAccount) return;
    setIsApproving(true);
    setError(null);
    try {
      const res = await authorizeOAuthConsent({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        user_id: selectedAccount.id,
        email: selectedAccount.email
      });

      if (res.redirect_url) {
        // Perform reliable top-level window navigation
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = res.redirect_url;
            return;
          }
        } catch {}
        window.location.href = res.redirect_url;
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
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
            <div>
              <span className="text-sm font-bold text-white block">Sign in with GoldMailer</span>
              <span className="text-[10px] text-zinc-400">Google OAuth Equivalent</span>
            </div>
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

        <div className="mt-4 space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white">
              Choose an account
            </h3>
            <p className="text-xs text-zinc-400">
              to continue to <strong className="text-white">{validatedName || appName}</strong>
            </p>
          </div>

          {/* Multi-Account Selector (Google OAuth Style) */}
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {accounts.length === 0 ? (
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-center space-y-1.5">
                <p className="text-xs text-zinc-300 font-medium">No account is currently signed in on this device.</p>
                <p className="text-[11px] text-zinc-400">Please sign in to GoldMailer to continue.</p>
              </div>
            ) : (
              accounts.map((acc) => {
                const isSelected = selectedAccount?.email.toLowerCase() === acc.email.toLowerCase();
                return (
                  <div
                    key={acc.email}
                    onClick={() => setSelectedAccount(acc)}
                    className={`p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-[#FF6A00]/15 border-[#FF6A00] shadow-md shadow-[#FF6A00]/10'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-semibold text-white text-sm flex-shrink-0">
                      {(acc.name || acc.username || 'M').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {acc.name || acc.username}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-400 truncate">
                        {acc.email}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-[#FF6A00] flex items-center justify-center text-white flex-shrink-0">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-white/30 flex-shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Permissions requested */}
          <div className="space-y-2 text-xs pt-1 border-t border-white/10">
            <p className="text-zinc-400 font-medium">
              <strong className="text-white">{validatedName || appName}</strong> will receive:
            </p>
            <div className="space-y-1.5">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#FF6A00] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">Email address</p>
                  <p className="text-[11px] text-[#FF8C42] font-mono truncate">
                    {selectedAccount?.email || 'Your GoldMailer email'}
                  </p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                <User className="w-4 h-4 text-[#FF8C42] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-white">Personal Information</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Name, username, date of birth, and account details
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 pt-1 leading-relaxed">
              By clicking <strong className="text-white font-semibold">Agree and Continue</strong>, you authorize <strong className="text-white">{validatedName || appName}</strong> to access your GoldMailer personal information.
            </p>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApproving || isValidating || !isClientValid || !selectedAccount}
              onClick={handleAllow}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-white font-semibold text-xs shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isValidating
                ? 'Validating...'
                : isApproving
                ? 'Redirecting to App...'
                : 'Agree and Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
