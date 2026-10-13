"use client";
import React, { useEffect, useState } from "react";

interface ClientData {
  client_id: string;
  app_name: string;
  app_type?: string;
  redirect_uris?: string[];
  javascript_origins?: string[];
}

interface OAuthAccount {
  id: string;
  email: string;
  username: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  date_of_birth?: string;
  avatar_url?: string;
}

export default function OAuthAuthorizePage() {
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Multi-account selection state
  const [accounts, setAccounts] = useState<OAuthAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<OAuthAccount | null>(null);

  // Inline Login state when no active session on this device
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const [params, setParams] = useState({
    clientId: "",
    redirectUri: "",
    scope: "openid email profile",
    state: "",
    responseType: "code"
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const clientId = url.searchParams.get("client_id") || "";
    const redirectUri = url.searchParams.get("redirect_uri") || "";
    const scope = url.searchParams.get("scope") || "openid email profile";
    const state = url.searchParams.get("state") || "";
    const responseType = url.searchParams.get("response_type") || "code";

    setParams({ clientId, redirectUri, scope, state, responseType });

    if (!clientId) {
      setLoading(false);
      setIsValid(false);
      setErrorMsg("Missing client_id parameter");
      return;
    }

    const validateAndLoad = async () => {
      try {
        const query = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri
        });

        // Read accounts logged in on this device from localStorage
        const localAccounts: OAuthAccount[] = [];
        const localEmails: string[] = [];
        try {
          const rawMulti = typeof window !== "undefined" ? localStorage.getItem("goldmailer_multi_accounts") : null;
          if (rawMulti) {
            const parsed = JSON.parse(rawMulti);
            if (Array.isArray(parsed)) {
              for (const acc of parsed) {
                if (acc && acc.email) {
                  localAccounts.push({
                    id: acc.id || "",
                    email: acc.email,
                    username: acc.username || acc.email.split("@")[0],
                    name: acc.name || acc.username,
                    avatar_url: acc.avatar_url
                  });
                  localEmails.push(acc.email.toLowerCase().trim());
                }
              }
            }
          }
          const rawUser = typeof window !== "undefined" ? localStorage.getItem("goldmail_user") : null;
          if (rawUser) {
            const u = JSON.parse(rawUser);
            if (u && u.email && !localEmails.includes(u.email.toLowerCase().trim())) {
              localAccounts.push({
                id: u.id || "",
                email: u.email,
                username: u.username || u.email.split("@")[0],
                name: u.first_name ? `${u.first_name} ${u.last_name || ""}`.trim() : (u.name || u.username),
                avatar_url: u.avatar_url
              });
              localEmails.push(u.email.toLowerCase().trim());
            }
          }
        } catch {}

        const token = typeof window !== "undefined" ? localStorage.getItem("goldmail_token") : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (localEmails.length > 0) headers["X-Device-Accounts"] = JSON.stringify(localEmails);

        const [resVal, resAccs] = await Promise.all([
          fetch(`/api/oauth/validate?${query.toString()}`).then(r => r.json()),
          fetch(`/api/oauth/accounts${localEmails.length > 0 ? `?emails=${encodeURIComponent(localEmails.join(","))}` : ""}`, { headers })
            .then(r => r.json())
            .catch(() => ({ accounts: [] }))
        ]);

        if (resVal.valid && resVal.client) {
          setIsValid(true);
          setClient(resVal.client);
        } else {
          setIsValid(false);
          setErrorMsg(resVal.error || "Invalid client_id or unauthorized redirect_uri");
        }

        // Combine verified server IP/device sync accounts with device local storage accounts
        const serverAccList: OAuthAccount[] = resAccs.accounts || [];
        const combinedMap = new Map<string, OAuthAccount>();

        for (const acc of localAccounts) {
          combinedMap.set(acc.email.toLowerCase(), acc);
        }

        for (const sAcc of serverAccList) {
          const existing = combinedMap.get(sAcc.email.toLowerCase());
          if (existing) {
            combinedMap.set(sAcc.email.toLowerCase(), {
              ...existing,
              id: sAcc.id || existing.id,
              name: sAcc.name || existing.name,
              username: sAcc.username || existing.username,
              avatar_url: sAcc.avatar_url || existing.avatar_url
            });
          } else if (localAccounts.length === 0) {
            // When localStorage is empty, rely on IP address sync / session sync from server
            combinedMap.set(sAcc.email.toLowerCase(), sAcc);
          }
        }

        const finalAccounts = Array.from(combinedMap.values());
        setAccounts(finalAccounts);
        setSelectedAccount(finalAccounts.length > 0 ? finalAccounts[0] : null);
      } catch (err: any) {
        setIsValid(false);
        setErrorMsg(err.message || "Failed to validate OAuth client");
      } finally {
        setLoading(false);
      }
    };

    validateAndLoad();
  }, []);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword.trim()) return;
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Login failed");
      }

      if (data.token) {
        localStorage.setItem("goldmail_token", data.token);
      }
      if (data.user) {
        localStorage.setItem("goldmail_user", JSON.stringify(data.user));
        const newAcc: OAuthAccount = {
          id: data.user.id,
          email: data.user.email,
          username: data.user.username,
          name: `${data.user.first_name || ""} ${data.user.last_name || ""}`.trim() || data.user.username,
          avatar_url: data.user.avatar_url
        };
        setAccounts((prev) => {
          const exists = prev.some((a) => a.email.toLowerCase() === newAcc.email.toLowerCase());
          return exists ? prev : [newAcc, ...prev];
        });
        setSelectedAccount(newAcc);
        setShowLoginForm(false);
        setLoginPassword("");
      }
    } catch (err: any) {
      setLoginError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAuthorize = async () => {
    if (!selectedAccount) return;
    setApproving(true);
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          scope: params.scope,
          state: params.state,
          user_id: selectedAccount.id,
          email: selectedAccount.email
        })
      });

      const data = await res.json();
      if (data.redirect_url) {
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = data.redirect_url;
            return;
          }
        } catch {}
        window.location.href = data.redirect_url;
      } else if (data.code && params.redirectUri) {
        const target = new URL(params.redirectUri);
        target.searchParams.set("code", data.code);
        target.searchParams.set("goldmailer_id", selectedAccount.id);
        target.searchParams.set("user_id", selectedAccount.id);
        target.searchParams.set("email", selectedAccount.email);
        if (selectedAccount.name) target.searchParams.set("name", selectedAccount.name);
        if (selectedAccount.username) target.searchParams.set("username", selectedAccount.username);
        const dobVal = selectedAccount.dob || selectedAccount.date_of_birth;
        if (dobVal) {
          target.searchParams.set("dob", dobVal);
          target.searchParams.set("date_of_birth", dobVal);
        }
        if (params.state) target.searchParams.set("state", params.state);
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = target.toString();
            return;
          }
        } catch {}
        window.location.href = target.toString();
      } else {
        alert(data.error || "Authorization error occurred");
        setApproving(false);
      }
    } catch (err: any) {
      alert(err.message || "Failed to authorize");
      setApproving(false);
    }
  };

  const handleCancel = () => {
    if (params.redirectUri) {
      const target = new URL(params.redirectUri);
      target.searchParams.set("error", "access_denied");
      if (params.state) target.searchParams.set("state", params.state);
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = target.toString();
          return;
        }
      } catch {}
      window.location.href = target.toString();
    } else {
      window.close();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111215] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-400">Verifying OAuth client credentials...</p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen bg-[#111215] text-white flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-[#1c1d22] border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <span className="text-xl">⚠️</span>
            <h2 className="text-base font-bold text-white">OAuth Error</h2>
          </div>
          <p className="text-xs text-zinc-300">
            {errorMsg || "Invalid client_id or unauthorized redirect_uri."}
          </p>
          <div className="p-3 bg-black/40 rounded-xl text-[11px] font-mono text-zinc-400 space-y-1">
            <div>client_id: {params.clientId || "(missing)"}</div>
            <div>redirect_uri: {params.redirectUri || "(missing)"}</div>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111215] text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white text-sm">
              G
            </div>
            <div>
              <span className="text-sm font-bold text-white block">Sign in with GoldMailer</span>
              <span className="text-[10px] text-zinc-400">Google OAuth Equivalent</span>
            </div>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">OAuth 2.0</span>
        </div>

        {/* Title */}
        <div className="space-y-1 text-center">
          <h2 className="text-base font-bold text-white">
            {accounts.length === 0 || showLoginForm ? "Sign in to GoldMailer" : "Choose an account"}
          </h2>
          <p className="text-xs text-zinc-400">
            to continue to <strong className="text-white">{client?.app_name || "Application"}</strong>
          </p>
        </div>

        {/* Multi-Account Selector or Inline Login Form (Google OAuth Style) */}
        {accounts.length === 0 || showLoginForm ? (
          <form onSubmit={handleInlineLogin} className="space-y-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
            {loginError && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-zinc-400 text-xs mb-1 font-medium">Email or Username</label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="username@goldmailer.xyz"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-[#FF6A00]"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-1 font-medium">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-[#FF6A00]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              {accounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLoginForm(false)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-zinc-300 font-semibold"
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={loggingIn}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-xs font-bold text-white shadow transition-all disabled:opacity-50 cursor-pointer"
              >
                {loggingIn ? "Signing in..." : "Sign in & Continue"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {accounts.map((acc) => {
              const isSelected = selectedAccount?.email.toLowerCase() === acc.email.toLowerCase();
              return (
                <div
                  key={acc.email}
                  onClick={() => setSelectedAccount(acc)}
                  className={`p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-[#FF6A00]/15 border-[#FF6A00] shadow-md shadow-[#FF6A00]/10"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-semibold text-white text-sm flex-shrink-0">
                    {(acc.name || acc.username || "M").charAt(0).toUpperCase()}
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
                    <div className="w-5 h-5 rounded-full bg-[#FF6A00] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      ✓
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-white/30 flex-shrink-0" />
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setShowLoginForm(true);
                setLoginIdentifier("");
                setLoginPassword("");
              }}
              className="w-full p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-dashed border-white/20 text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>+</span>
              <span>Use another account</span>
            </button>
          </div>
        )}

        {/* Permissions */}
        <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs space-y-1.5">
          <div className="text-zinc-400 text-[11px]">
            <strong className="text-white">{client?.app_name || "Application"}</strong> will receive:
          </div>
          <div className="text-white font-medium flex items-center gap-2">
            <span className="text-[#FF6A00]">•</span>
            <span>Email address ({selectedAccount?.email})</span>
          </div>
          <div className="text-white font-medium flex items-center gap-2">
            <span className="text-[#FF8C42]">•</span>
            <span>Personal Information: Name, username, date of birth, and account details</span>
          </div>
          <div className="text-[11px] text-zinc-400 pt-1 border-t border-white/5">
            By clicking <strong className="text-white font-semibold">Agree and Continue</strong>, you authorize this application to access your GoldMailer personal information.
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleAuthorize}
            disabled={approving || !selectedAccount}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-xs font-semibold text-white shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            {approving
              ? "Redirecting..."
              : "Agree and Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
