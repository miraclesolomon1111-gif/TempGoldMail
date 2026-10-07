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
  authorizeOAuthConsent,
  exchangeOAuthToken,
  fetchOAuthUserInfo
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

  // New Client Form
  const [appName, setAppName] = useState('');
  const [redirectUri, setRedirectUri] = useState('https://myapp.com/api/auth/callback/goldmailer');
  const [websiteUrl, setWebsiteUrl] = useState('https://myapp.com');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
  }, [isOpen]);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const data = await fetchOAuthClients();
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
    if (!appName.trim() || !redirectUri.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await createOAuthClient({
        app_name: appName.trim(),
        redirect_uri: redirectUri.trim(),
        website_url: websiteUrl.trim()
      });
      setClients([res.client, ...clients]);
      setTestSelectedClient(res.client.client_id);
      setActiveTab('clients');
      setAppName('');
    } catch (err: any) {
      alert(err.message || 'Failed to create app');
    } finally {
      setIsSubmitting(false);
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
                      <h4 className="text-sm font-bold text-white">{c.app_name}</h4>
                      <p className="text-[11px] text-[#FF8C42] font-mono">{c.redirect_uri}</p>
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      Created: {new Date(c.created_at).toLocaleDateString()}
                    </span>
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
                        <span className="text-zinc-200 truncate max-w-[240px]">{c.client_secret}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(c.client_secret, c.client_secret)}
                          className="text-[#FF8C42] hover:text-white"
                        >
                          {copiedId === c.client_secret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
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
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Application Name</label>
              <input
                type="text"
                required
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="My SaaS App / E-commerce Store"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Redirect URI (Callback)</label>
              <input
                type="url"
                required
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="https://myapp.com/api/auth/callback/goldmailer"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-[#FF6A00]"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Where user is redirected with the <code>code</code> query param after approval.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Website URL</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://myapp.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-xs shadow-md disabled:opacity-50"
            >
              {isSubmitting ? 'Registering...' : 'Register OAuth Client'}
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
      </div>
    </div>
  );
};
