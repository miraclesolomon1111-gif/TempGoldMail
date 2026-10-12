"use client";
import React, { useEffect, useState } from "react";

interface ClientData {
  client_id: string;
  app_name: string;
  app_type?: string;
  redirect_uris?: string[];
  javascript_origins?: string[];
}

export default function OAuthAuthorizePage() {
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

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

    const validate = async () => {
      try {
        const query = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri
        });
        const res = await fetch(`/api/oauth/validate?${query.toString()}`);
        const data = await res.json();
        if (data.valid && data.client) {
          setIsValid(true);
          setClient(data.client);
        } else {
          setIsValid(false);
          setErrorMsg(data.error || "Invalid client_id or unauthorized redirect_uri");
        }
      } catch (err: any) {
        setIsValid(false);
        setErrorMsg(err.message || "Failed to validate OAuth client");
      } finally {
        setLoading(false);
      }
    };

    validate();
  }, []);

  const handleAuthorize = async () => {
    setApproving(true);
    try {
      // Post authorization to server
      const token = localStorage.getItem("goldmailer_token") || "";
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          scope: params.scope,
          state: params.state
        })
      });

      const data = await res.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.code && params.redirectUri) {
        const target = new URL(params.redirectUri);
        target.searchParams.set("code", data.code);
        if (params.state) target.searchParams.set("state", params.state);
        window.location.href = target.toString();
      } else {
        alert(data.error || "Authorization error occurred");
      }
    } catch (err: any) {
      alert(err.message || "Failed to authorize");
    } finally {
      setApproving(false);
    }
  };

  const handleCancel = () => {
    if (params.redirectUri) {
      const target = new URL(params.redirectUri);
      target.searchParams.set("error", "access_denied");
      if (params.state) target.searchParams.set("state", params.state);
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
      <div className="w-full max-w-md bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white text-sm">
              G
            </div>
            <span className="text-sm font-bold text-white">Sign in with GoldMailer</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">OAuth 2.0</span>
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-lg font-bold text-white">
            {client?.app_name || "Application"} wants to access your account
          </h2>
          <p className="text-xs text-zinc-400">
            This will allow {client?.app_name || "the app"} to verify your email address and profile.
          </p>
        </div>

        <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs space-y-1">
          <div className="text-zinc-400 text-[11px]">Requested permissions:</div>
          <div className="text-white font-medium">• View your verified email address</div>
          <div className="text-white font-medium">• View your basic profile information</div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAuthorize}
            disabled={approving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-xs font-semibold text-white shadow transition-all disabled:opacity-50"
          >
            {approving ? "Authorizing..." : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}
