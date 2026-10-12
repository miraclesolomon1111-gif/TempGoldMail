"use client";
import { useState } from "react";

export default function DevPortal() {
  const [appType, setAppType] = useState("Web application");
  const [appName, setAppName] = useState("");
  const [origins, setOrigins] = useState([""]);
  const [redirects, setRedirects] = useState([""]);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/oauth/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: appName,
          app_type: appType,
          javascript_origins: origins.filter(Boolean),
          redirect_uris: redirects.filter(Boolean)
        })
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111215] text-white p-6 sm:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-2xl bg-[#1c1d22] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="border-b border-white/10 pb-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-[#FF6A00]">GoldMailer</span> OAuth 2.0 Client IDs
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure authorized JavaScript origins and authorized redirect URIs just like Google Cloud Console.
          </p>
        </div>

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
            <label className="block text-xs font-semibold text-zinc-300">Authorized JavaScript origins</label>
            <p className="text-[11px] text-zinc-400">
              For use with requests from a browser or SPA (e.g. https://goldmailer.xyz or https://example.com)
            </p>
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
            <label className="block text-xs font-semibold text-zinc-300">Authorized redirect URIs</label>
            <p className="text-[11px] text-zinc-400">
              For use with requests from a web server with an authorization code
            </p>
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

          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={save}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-sm shadow hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {result && (
            <div className="p-4 bg-black/60 border border-[#FF6A00]/40 rounded-xl space-y-2 text-xs font-mono">
              {result.client_id ? (
                <>
                  <div className="text-emerald-400 font-sans font-semibold text-sm">OAuth Client Created</div>
                  <div className="text-zinc-300 break-all">
                    <span className="text-zinc-500 select-none">Client ID: </span>
                    {result.client_id}
                  </div>
                  <div className="text-zinc-300 break-all">
                    <span className="text-zinc-500 select-none">Client Secret: </span>
                    {result.client_secret}
                  </div>
                  <div className="pt-2 text-zinc-400 font-sans text-[11px]">
                    Use in authorization URL: <code>/oauth/authorize?client_id={result.client_id}&redirect_uri=...</code>
                  </div>
                </>
              ) : (
                <div className="text-red-400">{JSON.stringify(result)}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
