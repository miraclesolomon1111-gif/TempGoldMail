"use client";
import React, { useState, useEffect } from "react";

export default function DevPortal() {
  const [appType, setAppType] = useState("Web application");
  const [appName, setAppName] = useState("");
  const [origins, setOrigins] = useState<string[]>([""]);
  const [redirects, setRedirects] = useState<string[]>([""]);
  const [apps, setApps] = useState<any[]>([]);
  const [newClient, setNewClient] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const handleSave = async () => {
    if (!appName.trim()) {
      alert("Please enter an Application Name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/oauth/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: appName.trim(),
          app_type: appType,
          javascript_origins: origins.filter(Boolean),
          redirect_uris: redirects.filter(Boolean)
        })
      });
      const data = await res.json();
      if (data.client_id) {
        setNewClient(data);
        setShowModal(true);
        await loadApps(); // APP IS SAVED ALREADY HERE
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

  const regenerateSecret = async (clientId: string) => {
    if (!confirm("Are you sure you want to regenerate this client secret? Any existing application using the old secret will need to be updated.")) {
      return;
    }
    try {
      const res = await fetch("/api/oauth/regenerate-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
      });
      const data = await res.json();
      if (data.client_secret) {
        alert("New Secret Generated:\n\n" + data.client_secret);
        await loadApps();
      } else {
        alert(data.error || "Failed to regenerate secret");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#111215] text-white p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-lg">
              G
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                GoldMailer <span className="text-[#FF6A00]">Developer Portal</span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Google OAuth Console equivalent: register OAuth 2.0 clients and manage redirect URIs
              </p>
            </div>
          </div>
        </div>

        {/* Create App Card */}
        <div className="bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>+ Create OAuth 2.0 Client ID</span>
          </h2>

          <div className="space-y-4 text-sm">
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
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Name</label>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="My App"
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
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-sm shadow hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {saving ? "Saving App..." : "SAVE"}
              </button>
            </div>
          </div>
        </div>

        {/* Modal on Save */}
        {showModal && newClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-lg bg-[#1c1d22] border-2 border-[#FF6A00]/50 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-white">
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> OAuth Client Created & Saved!
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Your client credentials are now permanently stored in the database.
                  </p>
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans font-medium text-[11px]">Client ID:</span>
                    <button
                      onClick={() => copyText(newClient.client_id, "modal_id")}
                      className="text-[#FF8C42] hover:text-white font-sans text-xs flex items-center gap-1"
                    >
                      {copiedId === "modal_id" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="text-zinc-200 break-all select-all font-semibold">
                    {newClient.client_id}
                  </div>
                </div>

                <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans font-medium text-[11px]">Client Secret:</span>
                    <button
                      onClick={() => copyText(newClient.client_secret, "modal_secret")}
                      className="text-[#FF8C42] hover:text-white font-sans text-xs flex items-center gap-1"
                    >
                      {copiedId === "modal_secret" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="text-zinc-200 break-all select-all font-semibold">
                    {newClient.client_secret}
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 font-sans">
                  Keep your client secret secure. You can regenerate it at any time from your application list.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow hover:opacity-95 cursor-pointer"
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
                All registered OAuth clients saved in database
              </p>
            </div>
            <button
              onClick={loadApps}
              className="text-xs text-zinc-400 hover:text-white border border-white/15 px-3 py-1.5 rounded-lg"
            >
              Refresh
            </button>
          </div>

          {apps.length === 0 ? (
            <div className="text-center py-10 space-y-2 text-zinc-400">
              <p className="text-sm">No applications registered yet.</p>
              <p className="text-xs text-zinc-500">
                Use the form above to create your first client. It will immediately appear here and persist across refreshes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apps.map((app) => (
                <div
                  key={app.client_id}
                  className="p-4 sm:p-5 bg-white/5 border border-white/10 rounded-xl space-y-3"
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
                        onClick={() => regenerateSecret(app.client_id)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-amber-300 font-medium transition-colors"
                      >
                        Regenerate Secret
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <span className="text-zinc-500 font-sans text-[11px]">Client ID:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200 truncate max-w-[260px] sm:max-w-md select-all">
                          {app.client_id}
                        </span>
                        <button
                          onClick={() => copyText(app.client_id, app.client_id)}
                          className="text-[#FF8C42] hover:text-white font-sans text-[11px]"
                        >
                          {copiedId === app.client_id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {app.redirect_uris && app.redirect_uris.length > 0 && (
                      <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
                        <span className="text-zinc-500 font-sans text-[11px]">Redirect URIs:</span>
                        <div className="space-y-0.5">
                          {app.redirect_uris.map((u: string, idx: number) => (
                            <div key={idx} className="text-[#FF8C42] break-all text-[11px]">
                              {u}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {app.javascript_origins && app.javascript_origins.length > 0 && (
                      <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
                        <span className="text-zinc-500 font-sans text-[11px]">JavaScript Origins:</span>
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
