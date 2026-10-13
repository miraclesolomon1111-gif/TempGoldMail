"use client";

import React, { useEffect, useState } from "react";
import {
  Laptop,
  Smartphone,
  Globe,
  Shield,
  LogOut,
  RefreshCw,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Monitor
} from "lucide-react";

interface GoldmailerSession {
  id: string;
  user_id: string;
  email: string;
  session_token: string;
  ip_address: string;
  city: string;
  country: string;
  device: string; // e.g. Chrome on Windows 11
  browser: string;
  os: string;
  user_agent?: string;
  is_current?: boolean;
  last_active: string;
  created_at: string;
}

export default function AccountSecurityPage() {
  const [sessions, setSessions] = useState<GoldmailerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("goldmail_user");
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch {}

    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("goldmail_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/security/sessions", {
        headers,
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error(`Failed to load sessions (${res.status})`);
      }

      const data = await res.json();
      if (data.sessions && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      } else {
        setSessions([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load device sessions");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutDevice = async (session: GoldmailerSession) => {
    const confirmLogout = window.confirm(
      `Sign out ${session.device || "this device"} (${session.ip_address})?`
    );
    if (!confirmLogout) return;

    setRevokingId(session.id || session.session_token);
    try {
      const token = localStorage.getItem("goldmail_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/security/sessions/revoke", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          session_token: session.session_token,
          id: session.id
        })
      });

      if (res.ok) {
        setActionMsg(`Signed out of ${session.device || "device"} successfully.`);
        setSessions(prev => prev.filter(s => s.id !== session.id && s.session_token !== session.session_token));
        setTimeout(() => setActionMsg(null), 4000);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to sign out device");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign out device");
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAllOtherDevices = async () => {
    const confirmLogout = window.confirm(
      "Sign out of all other devices? Only this current browser session will remain signed in."
    );
    if (!confirmLogout) return;

    setRevokingAll(true);
    try {
      const token = localStorage.getItem("goldmail_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/security/devices/revoke-all", {
        method: "POST",
        headers,
        credentials: "include"
      });

      if (res.ok) {
        setActionMsg("Signed out of all other devices successfully.");
        await loadSessions();
        setTimeout(() => setActionMsg(null), 4000);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to sign out other devices");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign out other devices");
    } finally {
      setRevokingAll(false);
    }
  };

  const formatLastActive = (dateStr: string, isCurrent?: boolean) => {
    if (isCurrent) return "Current device (Active now)";
    if (!dateStr) return "Recently";
    try {
      const date = new Date(dateStr);
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  const getDeviceIcon = (session: GoldmailerSession) => {
    const text = `${session.device} ${session.os} ${session.browser}`.toLowerCase();
    if (text.includes("android") || text.includes("iphone") || text.includes("mobile")) {
      return <Smartphone className="w-5 h-5 text-[#FF8C42]" />;
    }
    if (text.includes("mac") || text.includes("windows") || text.includes("linux")) {
      return <Laptop className="w-5 h-5 text-[#FF6A00]" />;
    }
    return <Monitor className="w-5 h-5 text-[#FF6A00]" />;
  };

  return (
    <div className="min-h-screen bg-[#111215] text-white p-4 sm:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top bar with back to inbox */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <a
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to GoldMailer
          </a>
          <button
            onClick={loadSessions}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#FF6A00]" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Header like Google Account Security */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white shadow-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Your devices</h1>
              <p className="text-xs text-zinc-400">
                Where you're signed in to GoldMailer ({currentUser?.email || "Account"})
              </p>
            </div>
          </div>
        </div>

        {/* Feedback banners */}
        {actionMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionMsg}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary Card */}
        <div className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white">
              {loading
                ? "Loading active sessions..."
                : `You are currently logged in on ${sessions.length} device${sessions.length === 1 ? "" : "s"}`}
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              GoldMailer monitors every browser and IP address where your account is accessed, exactly like Gmail.
            </p>
          </div>

          {sessions.length > 1 && (
            <button
              onClick={handleLogoutAllOtherDevices}
              disabled={revokingAll}
              className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {revokingAll ? "Signing out..." : "Logout from all other devices"}
            </button>
          )}
        </div>

        {/* Device Rows List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Active Browser & Device Sessions
          </h3>

          {loading ? (
            <div className="p-8 text-center bg-white/5 border border-white/10 rounded-2xl space-y-2">
              <div className="w-6 h-6 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-zinc-400">Detecting devices and active locations...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center bg-white/5 border border-white/10 rounded-2xl">
              <p className="text-xs text-zinc-400">No active sessions found.</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isCurrent = Boolean(session.is_current);
              const isRevoking = revokingId === (session.id || session.session_token);

              return (
                <div
                  key={session.id || session.session_token}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isCurrent
                      ? "bg-[#FF6A00]/10 border-[#FF6A00]/50 shadow-md shadow-[#FF6A00]/5"
                      : "bg-white/5 border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0">
                      {getDeviceIcon(session)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">
                          {session.device || `${session.browser} on ${session.os}`}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Current device
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-zinc-300 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                        <span>IP: {session.ip_address || "Unknown"}</span>
                        <span>·</span>
                        <span className="text-zinc-400 font-sans">
                          {[session.city, session.country].filter(Boolean).join(", ") || "Unknown Location"}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span>Last active: {formatLastActive(session.last_active, isCurrent)}</span>
                      </div>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => handleLogoutDevice(session)}
                      disabled={isRevoking}
                      className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/20 hover:text-red-400 text-zinc-300 text-xs font-semibold transition-all border border-white/10 flex-shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isRevoking ? "Signing out..." : "Logout this device"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Recent Security Activity like Gmail */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Recent security activity
          </h3>
          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-xs space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Device protection active</p>
                <p className="text-zinc-400 text-[11px]">
                  If you sign in on a new computer or another country, GoldMailer will detect the new IP address and register it here immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
