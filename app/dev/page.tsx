"use client";
import React, { useState, useEffect } from "react";

interface OAuthAppItem {
  client_id: string;
  client_secret?: string;
  app_name: string;
  app_type?: string;
  javascript_origins?: string[];
  redirect_uris?: string[];
  user_id?: string;
  created_at?: string;
}

export default function DevPortal() {
  const [appType, setAppType] = useState("Web application");
  const [appName, setAppName] = useState("");
  const [origins, setOrigins] = useState<string[]>([""]);
  const [redirects, setRedirects] = useState<string[]>([""]);
  const [apps, setApps] = useState<OAuthAppItem[]>([]);
  
  // Creation modal state (only holds secret until DONE is tapped)
  const [createdClient, setCreatedClient] = useState<{ client_id: string; client_secret: string; app_name: string } | null>(null);
  const [showCreatedModal, setShowCreatedModal] = useState(false);

  // Regeneration modal state (only holds secret until DONE is tapped)
  const [regeneratedClient, setRegeneratedClient] = useState<{ client_id: string; client_secret: string; app_name: string } | null>(null);
  const [showRegeneratedModal, setShowRegeneratedModal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadApps = async () => {
    try {
      const res = await fetch("/api/oauth/list-clients");
      const data = await res.json();
      setApps(data.clients || []);
    } catch (e) {
      console.warn("Failed to load apps:", e);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!appName.trim()) {
      alert("Please enter an Application Name");
      return;
    }
    setSaving(true);
    try {
      const cleanOrigins = origins.filter(Boolean);
      const cleanRedirects = redirects.filter(Boolean);
      const res = await fetch("/api/oauth/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: appName.trim(),
          app_type: appType,
          javascript_origins: cleanOrigins,
          redirect_uris: cleanRedirects
        })
      });
      const data = await res.json();
      if (data.client_id && data.client_secret) {
        // 1. App is saved immediately to database
        // 2. Open popup modal with client_id and client_secret
        setCreatedClient({
          client_id: data.client_id,
          client_secret: data.client_secret,
          app_name: appName.trim()
        });
        setShowCreatedModal(true);
        // Refresh apps list in background so it's already updated
        await loadApps();
        // Reset form inputs
        setAppName("");
        setOrigins([""]);
        setRedirects([""]);
      } else {
        alert(data.error || "Failed to create OAuth client");
      }
    } catch (err: any) {
      alert(err.message || "Failed to save OAuth client");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSecret = async (appItem: OAuthAppItem) => {
    if (
      !confirm(
        `Are you sure you want to regenerate the client secret for "${appItem.app_name}"?\n\nThe existing secret will stop working immediately. Client ID will remain permanent.`
      )
    ) {
      return;
    }

    setRegeneratingId(appItem.client_id);
    try {
      const res = await fetch("/api/oauth/regenerate-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: appItem.client_id })
      });
      const data = await res.json();
      if (data.client_secret) {
        setRegeneratedClient({
          client_id: appItem.client_id,
          client_secret: data.client_secret,
          app_name: appItem.app_name
        });
        setShowRegeneratedModal(true);
        await loadApps();
      } else {
        alert(data.error || "Failed to regenerate secret");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setRegeneratingId(null);
    }
  };

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Close creation modal and securely purge secret from memory
  const handleDoneCreatedModal = () => {
    setShowCreatedModal(false);
    setCreatedClient(null);
    setCopiedKey(null);
  };

  // Close regeneration modal and securely purge secret from memory
  const handleDoneRegeneratedModal = () => {
    setShowRegeneratedModal(false);
    setRegeneratedClient(null);
    setCopiedKey(null);
  };

  return (
    <div className="min-h-screen bg-[#111215] text-white p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-lg text-lg">
              G
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <span>GoldMailer</span>
                <span className="text-[#FF6A00]">Developer Console</span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                OAuth 2.0 Credentials & Client Management • Google OAuth Console Equivalent
              </p>
            </div>
          </div>
        </div>

        {/* Create OAuth Client Card */}
        <div className="bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
              <span>Create OAuth 2.0 Client ID</span>
            </h2>
            <span className="text-[11px] text-zinc-400 font-mono">Google OAuth Flow</span>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Application type</label>
              <select
                value={appType}
                onChange={(e) => setAppType(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              >
                <option value="Web application">Web application</option>
                <option value="Website">Website</option>
                <option value="Mobile app">Mobile app</option>
                <option value="Desktop app">Desktop app</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Application Name</label>
              <input
                value={appName}
                required
                onChange={(e) => setAppName(e.target.value)}
                placeholder="My Web Application"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300">Authorized JavaScript origins</label>
                <span className="text-[10px] text-zinc-400">e.g. https://goldmailer.xyz</span>
              </div>
              {origins.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={o}
                    onChange={(e) => {
                      const c = [...origins];
                      c[i] = e.target.value;
                      setOrigins(c);
                    }}
                    placeholder="https://example.com"
                    className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOrigins([...origins, ""])}
                className="text-xs font-medium text-[#FF8C42] hover:text-[#FF6A00] transition-colors"
              >
                + Add origin
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300">Authorized redirect URIs</label>
                <span className="text-[10px] text-zinc-400">e.g. https://example.com/auth/callback</span>
              </div>
              {redirects.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={r}
                    onChange={(e) => {
                      const c = [...redirects];
                      c[i] = e.target.value;
                      setRedirects(c);
                    }}
                    placeholder="https://example.com/auth/callback"
                    className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRedirects([...redirects, ""])}
                className="text-xs font-medium text-[#FF8C42] hover:text-[#FF6A00] transition-colors"
              >
                + Add redirect URI
              </button>
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-sm shadow hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>SAVE</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* POPUP MODAL 1: Newly Created OAuth Client */}
        {showCreatedModal && createdClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="relative w-full max-w-lg bg-[#1c1d22] border-2 border-[#FF6A00]/50 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-white animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                  <span className="text-xl">✓</span>
                  <span>OAuth client created</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Your credentials for <strong className="text-white">{createdClient.app_name}</strong> are saved to the database.
                </p>
                <div className="mt-2.5 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                  ⚠️ <strong>Important:</strong> Copy your Client Secret now. For security reasons, the secret will <strong>never be shown or copyable again</strong> after you tap DONE. If lost, you must regenerate a new secret.
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* Client ID */}
                <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans font-medium text-[11px]">
                      Client ID (Permanent):
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdClient.client_id, "modal_id")}
                      className="px-2.5 py-1 rounded bg-[#FF6A00]/20 hover:bg-[#FF6A00]/30 text-[#FF8C42] font-sans text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      {copiedKey === "modal_id" ? "✓ Copied!" : "Copy Client ID"}
                    </button>
                  </div>
                  <div className="text-zinc-200 break-all select-all font-semibold pt-1">
                    {createdClient.client_id}
                  </div>
                </div>

                {/* Client Secret */}
                <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans font-medium text-[11px]">
                      Client Secret (One-Time View):
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdClient.client_secret, "modal_secret")}
                      className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-sans text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      {copiedKey === "modal_secret" ? "✓ Copied!" : "Copy Client Secret"}
                    </button>
                  </div>
                  <div className="text-emerald-400 break-all select-all font-semibold pt-1">
                    {createdClient.client_secret}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleDoneCreatedModal}
                  className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow-lg hover:opacity-95 cursor-pointer transition-all"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POPUP MODAL 2: Regenerated Secret */}
        {showRegeneratedModal && regeneratedClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="relative w-full max-w-lg bg-[#1c1d22] border-2 border-amber-500/50 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-white animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                  <span className="text-xl">🔄</span>
                  <span>New Client Secret Generated</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  A replacement secret was created for <strong className="text-white">{regeneratedClient.app_name}</strong>. The previous secret is now invalid.
                </p>
                <div className="mt-2.5 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                  ⚠️ <strong>Notice:</strong> Copy this secret now. It will <strong>never be shown or copyable again</strong> after you tap DONE.
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* Client ID (Permanent) */}
                <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <span className="text-zinc-400 font-sans font-medium text-[11px]">
                    Client ID (Permanent - Unchanged):
                  </span>
                  <div className="text-zinc-200 break-all select-all font-semibold">
                    {regeneratedClient.client_id}
                  </div>
                </div>

                {/* New Client Secret */}
                <div className="p-3 bg-black/50 border border-emerald-500/30 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans font-medium text-[11px]">
                      New Client Secret (One-Time View):
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(regeneratedClient.client_secret, "regen_secret")}
                      className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-sans text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      {copiedKey === "regen_secret" ? "✓ Copied!" : "Copy New Secret"}
                    </button>
                  </div>
                  <div className="text-emerald-400 break-all select-all font-semibold pt-1">
                    {regeneratedClient.client_secret}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleDoneRegeneratedModal}
                  className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow-lg hover:opacity-95 cursor-pointer transition-all"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* My Apps List */}
        <div className="bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>MY APPS LIST</span>
                <span className="text-xs bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/40 px-2 py-0.5 rounded-full font-bold">
                  {apps.length}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Saved OAuth 2.0 clients in database • Persists across page refresh
              </p>
            </div>
            <button
              onClick={loadApps}
              className="text-xs text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>

          {apps.length === 0 ? (
            <div className="text-center py-12 space-y-2 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-xl">
                📋
              </div>
              <p className="text-sm font-semibold text-white">No applications registered yet</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Fill the form above and tap SAVE. Your app will save immediately and appear here permanently.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apps.map((app) => (
                <div
                  key={app.client_id}
                  className="p-4 sm:p-5 bg-white/5 border border-white/10 rounded-xl space-y-3.5 hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {app.app_name}
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-zinc-300 font-normal">
                          {app.app_type || "Web application"}
                        </span>
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Created: {new Date(app.created_at || Date.now()).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={regeneratingId === app.client_id}
                        onClick={() => handleRegenerateSecret(app)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-amber-300 hover:text-amber-200 font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {regeneratingId === app.client_id ? (
                          <>
                            <span className="w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                            <span>Regenerating...</span>
                          </>
                        ) : (
                          <>
                            <span>🔄</span>
                            <span>REGENERATE SECRET</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs font-mono">
                    {/* Client ID: Always visible and copyable */}
                    <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <div className="min-w-0 flex-1 mr-3">
                        <span className="text-zinc-500 font-sans text-[11px] block">
                          Client ID (Permanent):
                        </span>
                        <span className="text-zinc-200 truncate block font-semibold select-all">
                          {app.client_id}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(app.client_id, `app_${app.client_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-[#FF6A00]/20 hover:bg-[#FF6A00]/30 text-[#FF8C42] font-sans text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
                      >
                        {copiedKey === `app_${app.client_id}` ? "✓ Copied" : "Copy Client ID"}
                      </button>
                    </div>

                    {/* Client Secret: NOT viewable or copyable after modal closed */}
                    <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <div className="min-w-0 flex-1 mr-3">
                        <span className="text-zinc-500 font-sans text-[11px] block">
                          Client Secret:
                        </span>
                        <span className="text-zinc-500 tracking-widest select-none">
                          ••••••••••••••••••••••••••••••••
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-sans bg-white/5 px-2.5 py-1 rounded-lg">
                        Hidden for security
                      </span>
                    </div>

                    {/* Redirect URIs */}
                    {app.redirect_uris && app.redirect_uris.length > 0 && (
                      <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
                        <span className="text-zinc-500 font-sans text-[11px]">Authorized Redirect URIs:</span>
                        <div className="space-y-0.5">
                          {app.redirect_uris.map((u: string, idx: number) => (
                            <div key={idx} className="text-[#FF8C42] break-all text-[11px]">
                              {u}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* JavaScript Origins */}
                    {app.javascript_origins && app.javascript_origins.length > 0 && (
                      <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
                        <span className="text-zinc-500 font-sans text-[11px]">Authorized JavaScript Origins:</span>
                        <div className="space-y-0.5">
                          {app.javascript_origins.map((o: string, idx: number) => (
                            <div key={idx} className="text-emerald-400 break-all text-[11px]">
                              {o}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
