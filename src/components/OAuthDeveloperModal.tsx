import React, { useState, useEffect } from 'react';
import {
  X,
  Code2,
  Plus,
  Key,
  Copy,
  Check,
  Globe,
  ExternalLink,
  ShieldCheck,
  Play,
  Terminal,
  Sparkles
} from 'lucide-react';
import { OAuthClient } from '../types';
import {
  fetchOAuthClients,
  createOAuthClient,
  regenerateOAuthClientSecret,
  authorizeOAuthConsent,
  exchangeOAuthToken,
  fetchOAuthUserInfo,
  getHeaders
} from '../lib/api';

interface OAuthDeveloperModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
}

export const OAuthDeveloperModal: React.FC<OAuthDeveloperModalProps> = ({
  isOpen,
  onClose,
  activeEmail
}) => {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'register' | 'test'>('clients');

  // New Client Form (Google OAuth Console styled)
  const [appType, setAppType] = useState('Web application');
  const [appName, setAppName] = useState('');
  const [origins, setOrigins] = useState<string[]>(['']);
  const [redirects, setRedirects] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ client_id: string; client_secret: string; app_name: string } | null>(null);
  const [regenModalData, setRegenModalData] = useState<{ client_id: string; client_secret: string } | null>(null);

  // Testing Sandbox state
  const [testSelectedClient, setTestSelectedClient] = useState<string>('');
  const [testCode, setTestCode] = useState<string>('');
  const [testTokenResponse, setTestTokenResponse] = useState<any>(null);
  const [testUserInfoResponse, setTestUserInfoResponse] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadClients();
    }
  }, [isOpen, activeEmail]);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const data = await fetchOAuthClients(activeEmail);
      setClients(data);
      if (data.length > 0 && !testSelectedClient) {
        setTestSelectedClient(data[0].client_id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;
    setIsSubmitting(true);
    try {
      const cleanOrigins = origins.filter(Boolean);
      const cleanRedirects = redirects.filter(Boolean);
      const headers = getHeaders() as Record<string, string>;
      const res = await fetch('/api/oauth/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers, 'x-user-email': activeEmail },
        body: JSON.stringify({
          app_name: appName.trim(),
          app_type: appType,
          javascript_origins: cleanOrigins,
          redirect_uris: cleanRedirects,
          user_id: activeEmail,
          owner_email: activeEmail
        })
      });
      const data = await res.json();
      if (data.client_id) {
        setCreatedResult({
          client_id: data.client_id,
          client_secret: data.client_secret,
          app_name: appName.trim()
        });
        await loadClients();
        setAppName('');
        setOrigins(['']);
        setRedirects(['']);
      } else {
        alert(data.error || 'Failed to create client');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create app');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerateSecret = async (clientId: string) => {
    if (!confirm('Are you sure you want to regenerate this client secret? The old secret will no longer work.')) return;
    try {
      const res = await regenerateOAuthClientSecret(clientId);
      if (res.client_secret) {
        setRegenModalData({ client_id: clientId, client_secret: res.client_secret });
        await loadClients();
      }
    } catch (e: any) {
      alert(e.message || 'Failed to regenerate secret');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Run full simulation of "Continue with GoldMailer" OAuth flow
  const runTestFlow = async () => {
    const client = clients.find((c) => c.client_id === testSelectedClient) || clients[0];
    if (!client) return;

    setIsTesting(true);
    setTestCode('');
    setTestTokenResponse(null);
    setTestUserInfoResponse(null);

    try {
      // 1. Authorize -> Get Code
      const authRes = await authorizeOAuthConsent({
        client_id: client.client_id,
        redirect_uri: client.redirect_uri,
        scope: 'openid email profile'
      });
      setTestCode(authRes.code);

      // 2. Exchange Code for Token
      const tokenRes = await exchangeOAuthToken({
        code: authRes.code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: client.redirect_uri
      });
      setTestTokenResponse(tokenRes);

      // 3. Query UserInfo using Bearer Token
      if (tokenRes.access_token) {
        const userinfo = await fetchOAuthUserInfo(tokenRes.access_token);
        setTestUserInfoResponse(userinfo);
      }
    } catch (err: any) {
      alert(err.message || 'OAuth flow test failed');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#18191c]/95 border-2 border-[#FF6A00]/30 text-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Glow */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#FF6A00]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-md">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>GoldMailer OAuth 2.0 Provider</span>
                <span className="text-[10px] bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/40 px-2 py-0.5 rounded-full font-bold">
                  Dev Portal
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Let users "Continue with GoldMailer" on your third-party website
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2 border-b border-white/10 pb-2 flex-shrink-0 text-xs">
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'clients' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Registered Apps ({clients.length})
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'register' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            + Register New App
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'test' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Live OAuth Playground
          </button>
        </div>

        {/* Tab 1: Registered Clients */}
        {activeTab === 'clients' && (
          <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
            {clients.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <Code2 className="w-10 h-10 text-zinc-500 mx-auto" />
                <p className="text-sm text-zinc-400">No OAuth applications registered yet.</p>
                <button
                  onClick={() => setActiveTab('register')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-xs font-semibold text-white shadow"
                >
                  Create your first OAuth app
                </button>
              </div>
            ) : (
              clients.map((c) => (
                <div key={c.client_id} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {c.app_name}
                        {c.app_type && (
                          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-zinc-300 font-normal">
                            {c.app_type}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-[#FF8C42] font-mono">{c.redirect_uri}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(c.client_id, c.client_id)}
                        className="text-[10px] bg-white/10 hover:bg-white/15 text-zinc-300 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        Copy ID
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateSecret(c.client_id)}
                        className="text-[10px] bg-white/10 hover:bg-white/15 text-amber-300 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        Regenerate Secret
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete ${c.app_name}? This will break any site using it.`)) return;
                          const headers = getHeaders() as Record<string, string>;
                          await fetch('/api/oauth/delete-client', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...headers, 'x-user-email': activeEmail },
                            body: JSON.stringify({ client_id: c.client_id })
                          });
                          loadClients();
                        }}
                        style={{ background: 'red', color: 'white', marginLeft: 8 }}
                        className="text-[10px] bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        DELETE
                      </button>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between bg-black/40 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400">client_id:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200 truncate max-w-[240px]">{c.client_id}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(c.client_id, c.client_id)}
                          className="text-[#FF8C42] hover:text-white"
                        >
                          {copiedId === c.client_id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-black/40 p-2 rounded-xl border border-white/5">
                      <span className="text-zinc-400">client_secret:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 tracking-widest select-none text-[10px]">••••••••••••••••••••••••••••••••</span>
                        <span className="text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded font-sans">
                          Hidden for security
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ready-to-use HTML snippet */}
                  <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400 font-sans">Website Embed Snippet:</span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `<a href="https://goldmailer.xyz/oauth/authorize?client_id=${c.client_id}&redirect_uri=${encodeURIComponent(c.redirect_uri)}&response_type=code&scope=openid%20email%20profile" style="background:#FF6A00;color:white;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-flex;align-items:center;gap:8px;">Continue with GoldMailer</a>`,
                            `embed_${c.client_id}`
                          )
                        }
                        className="text-[#FF8C42] hover:underline"
                      >
                        Copy HTML Button
                      </button>
                    </div>
                    <pre className="text-[10px] text-zinc-300 font-mono overflow-x-auto p-1.5 bg-black/40 rounded">
                      {`<a href="https://goldmailer.xyz/oauth/authorize?client_id=${c.client_id}&redirect_uri=${encodeURIComponent(c.redirect_uri)}&response_type=code">Continue with GoldMailer</a>`}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Register Form */}
        {activeTab === 'register' && (
          <form onSubmit={handleCreate} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Application Type</label>
              <select
                value={appType}
                onChange={(e) => setAppType(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              >
                <option value="Web application" className="bg-[#18191c]">Web application</option>
                <option value="Website" className="bg-[#18191c]">Website</option>
                <option value="Mobile app" className="bg-[#18191c]">Mobile app</option>
                <option value="Desktop app" className="bg-[#18191c]">Desktop app</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Name</label>
              <input
                type="text"
                required
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="My App"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300">Authorized JavaScript Origins</label>
              <p className="text-[11px] text-zinc-400">
                Origins allowed for browser or SPA requests (e.g. https://goldmailer.xyz or https://example.com)
              </p>
              {origins.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    value={o}
                    onChange={(e) => {
                      const c = [...origins];
                      c[i] = e.target.value;
                      setOrigins(c);
                    }}
                    placeholder="https://example.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOrigins([...origins, ''])}
                className="text-xs font-medium text-[#FF8C42] hover:text-[#FF6A00]"
              >
                + Add origin
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300">Authorized Redirect URIs</label>
              <p className="text-[11px] text-zinc-400">
                URIs where users are redirected with authorization code (e.g. https://example.com/auth/callback)
              </p>
              {redirects.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    value={r}
                    onChange={(e) => {
                      const c = [...redirects];
                      c[i] = e.target.value;
                      setRedirects(c);
                    }}
                    placeholder="https://example.com/auth/callback"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRedirects([...redirects, ''])}
                className="text-xs font-medium text-[#FF8C42] hover:text-[#FF6A00]"
              >
                + Add redirect URI
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}

        {/* Tab 3: Live Testing Sandbox */}
        {activeTab === 'test' && (
          <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Test "Continue with GoldMailer" Button</p>
                <p className="text-[11px] text-zinc-400">
                  Simulates authorize &rarr; code exchange &rarr; userinfo extraction for {activeEmail}
                </p>
              </div>
              <button
                type="button"
                disabled={isTesting}
                onClick={runTestFlow}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isTesting ? 'Running...' : 'Run OAuth Simulation'}
              </button>
            </div>

            {testCode && (
              <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                <span className="text-[11px] text-[#FF8C42] font-semibold">1. Issued Auth Code:</span>
                <p className="font-mono text-zinc-300 text-[11px] break-all">{testCode}</p>
              </div>
            )}

            {testTokenResponse && (
              <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                <span className="text-[11px] text-[#FF8C42] font-semibold">2. /api/oauth/token Response:</span>
                <pre className="text-[11px] text-emerald-400 font-mono overflow-x-auto bg-black/50 p-2 rounded">
                  {JSON.stringify(testTokenResponse, null, 2)}
                </pre>
              </div>
            )}

            {testUserInfoResponse && (
              <div className="p-3 bg-black/60 rounded-xl border border-emerald-500/30 rounded-xl space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold">3. /api/oauth/userinfo (Payload):</span>
                <pre className="text-[11px] text-white font-mono overflow-x-auto bg-black/50 p-2 rounded">
                  {JSON.stringify(testUserInfoResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* POPUP MODAL: Newly Created OAuth Client */}
        {createdResult && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="relative w-full max-w-md bg-[#18191c] border-2 border-[#FF6A00]/50 rounded-2xl p-6 shadow-2xl space-y-4 text-white">
              <div className="border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <span>✓</span>
                  <span>OAuth client created</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Credentials for <strong>{createdResult.app_name}</strong> are saved to database.
                </p>
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-[10px] leading-relaxed">
                  ⚠️ Copy your Client Secret now. For security reasons, it will <strong>never be shown or copyable again</strong> after you tap DONE.
                </div>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans text-[11px]">Client ID (Permanent):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdResult.client_id, 'modal_cid')}
                      className="text-[#FF8C42] hover:text-white font-sans text-xs"
                    >
                      {copiedId === 'modal_cid' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-zinc-200 break-all select-all font-semibold">
                    {createdResult.client_id}
                  </div>
                </div>

                <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans text-[11px]">Client Secret (One-Time View):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdResult.client_secret, 'modal_sec')}
                      className="text-emerald-300 hover:text-white font-sans text-xs"
                    >
                      {copiedId === 'modal_sec' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-emerald-400 break-all select-all font-semibold">
                    {createdResult.client_secret}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreatedResult(null);
                    setActiveTab('clients');
                  }}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow hover:opacity-95 cursor-pointer"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POPUP MODAL: Regenerated Secret */}
        {regenModalData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="relative w-full max-w-md bg-[#18191c] border-2 border-amber-500/50 rounded-2xl p-6 shadow-2xl space-y-4 text-white">
              <div className="border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <span>🔄</span>
                  <span>New Client Secret Generated</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Previous secret was invalidated. Client ID remains permanent.
                </p>
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-[10px]">
                  ⚠️ Copy this secret now. It will <strong>never be shown again</strong>.
                </div>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl space-y-1">
                  <span className="text-zinc-400 font-sans text-[11px]">Client ID:</span>
                  <div className="text-zinc-200 break-all">{regenModalData.client_id}</div>
                </div>

                <div className="p-2.5 bg-black/50 border border-emerald-500/30 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-sans text-[11px]">New Secret:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(regenModalData.client_secret, 'modal_regen_sec')}
                      className="text-emerald-300 hover:text-white font-sans text-xs"
                    >
                      {copiedId === 'modal_regen_sec' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-emerald-400 break-all select-all font-semibold">
                    {regenModalData.client_secret}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRegenModalData(null)}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow hover:opacity-95 cursor-pointer"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
