import React, { useState } from 'react';
import {
  Shield,
  FileText,
  Mail,
  Zap,
  Lock,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Server,
  EyeOff,
  Flame,
  Globe,
  RefreshCw,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { PRIMARY_DOMAIN } from '../lib/emailGenerator';

interface HeroLegalPageProps {
  onBackToApp: () => void;
  initialSection?: 'hero' | 'terms' | 'privacy';
  activeEmail: string;
}

export const HeroLegalPage: React.FC<HeroLegalPageProps> = ({
  onBackToApp,
  initialSection = 'hero',
  activeEmail,
}) => {
  const [activeTab, setActiveTab] = useState<'hero' | 'terms' | 'privacy'>(initialSection);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white selection:bg-[#00C07F] selection:text-black">
      {/* Top Sticky Navigation */}
      <nav className="sticky top-0 z-50 bg-[#121212]/90 backdrop-blur-xl border-b border-[#242424] px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('hero')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00A066] to-[#00C07F] flex items-center justify-center shadow-lg shadow-[#00C07F]/20">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">GoldMailer</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#00C07F]/15 text-[#00C07F] rounded border border-[#00C07F]/30">
                xyz
              </span>
            </div>
          </div>

          {/* Section Nav Links */}
          <div className="hidden sm:flex items-center space-x-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('hero')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'hero' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'terms' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Terms of Usage
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'privacy' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Privacy Policy
            </button>
          </div>

          {/* Action button to switch back to Webmail */}
          <button
            onClick={onBackToApp}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#00C07F] hover:bg-[#00D78E] text-black font-extrabold text-xs shadow-md shadow-[#00C07F]/20 active:scale-95 transition-all"
          >
            <Mail className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Open Webmail</span>
          </button>
        </div>

        {/* Mobile secondary tab switcher */}
        <div className="flex sm:hidden mt-2 pt-2 border-t border-zinc-800/80 grid grid-cols-3 gap-1">
          <button
            onClick={() => setActiveTab('hero')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center ${
              activeTab === 'hero' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center ${
              activeTab === 'terms' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400'
            }`}
          >
            Terms
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center ${
              activeTab === 'privacy' ? 'bg-[#00C07F] text-black font-bold' : 'text-zinc-400'
            }`}
          >
            Privacy
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* ================= 1. HERO SECTION ================= */}
        {activeTab === 'hero' && (
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Hero Main Header */}
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#00C07F]/15 text-[#00C07F] border border-[#00C07F]/30 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#00C07F] animate-pulse" />
                <span>Next-Gen Temporary Disposable Email • {PRIMARY_DOMAIN}</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Spam-Free, Disposable Email with <span className="text-[#00C07F]">Instant Realtime</span> Delivery
              </h1>

              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                Protect your primary inbox from spam, data leaks, and unwanted newsletters. 
                Generate disposable inboxes on <strong className="text-white">goldmailer.xyz</strong> with Cloudflare Catch-All routing and sandboxed email parsing.
              </p>

              {/* Quick Hero Email Box */}
              <div className="pt-2">
                <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-4 sm:p-5 max-w-lg mx-auto shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-[#00C07F]" />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="text-[11px] text-zinc-400 block font-medium">Your Ready Disposable Address:</span>
                      <span className="font-mono text-sm sm:text-base font-bold text-white truncate block">
                        {activeEmail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0">
                    <button
                      onClick={handleCopy}
                      className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white border border-zinc-700 transition-colors flex items-center justify-center space-x-1.5"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#00C07F]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={onBackToApp}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#00C07F] hover:bg-[#00D78E] text-black font-extrabold text-xs shadow-md shadow-[#00C07F]/20 transition-all flex items-center justify-center space-x-1.5"
                    >
                      <span>Go to Inbox</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4">
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-4 text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#00C07F]">0%</div>
                <div className="text-xs text-zinc-400 mt-1">Spam In Real Inbox</div>
              </div>
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-4 text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-white">&lt; 2s</div>
                <div className="text-xs text-zinc-400 mt-1">Catch-All Latency</div>
              </div>
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-4 text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400">100%</div>
                <div className="text-xs text-zinc-400 mt-1">Sandboxed HTML</div>
              </div>
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-4 text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-400">Zero</div>
                <div className="text-xs text-zinc-400 mt-1">User Logs Stored</div>
              </div>
            </div>

            {/* Feature Cards Grid */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white text-center">
                Engineered for Speed, Privacy & Simplicity
              </h2>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00C07F]/15 border border-[#00C07F]/30 flex items-center justify-center text-[#00C07F]">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Cloudflare Catch-All</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Every incoming email addressed to any <code className="text-zinc-200">@goldmailer.xyz</code> handle is routed directly into your live webmail via Cloudflare Email Routing Workers.
                  </p>
                </div>

                <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Isolated Sandbox Reader</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Emails render in secure, script-disabled sandboxed iframes. Tracking pixels, external scripts, and malicious links are nullified before reaching you.
                  </p>
                </div>

                <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Multi-Address Switcher</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Generate dozens of addresses simultaneously. Switch between random, domain-based, or custom handles with real-time message counters.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick jump to Legal Docs */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-white text-base">Looking for our Legal & Compliance Policies?</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Review our complete Terms of Usage and Privacy Policy below to understand our zero-log architecture.
                </p>
              </div>
              <div className="flex space-x-2 w-full sm:w-auto">
                <button
                  onClick={() => setActiveTab('terms')}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors"
                >
                  Terms of Usage
                </button>
                <button
                  onClick={() => setActiveTab('privacy')}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. TERMS OF USAGE ================= */}
        {activeTab === 'terms' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="border-b border-zinc-800 pb-4">
              <div className="flex items-center space-x-2 text-xs text-[#00C07F] font-semibold mb-1">
                <FileText className="w-4 h-4" />
                <span>Legal Agreement</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Terms of Usage (Terms of Service)
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Last updated: October 2026 • Governing service on <strong>goldmailer.xyz</strong>
              </p>
            </div>

            <div className="space-y-6 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-[#00C07F]/20 text-[#00C07F] text-xs font-bold flex items-center justify-center">1</span>
                  <span>Acceptance of Terms</span>
                </h3>
                <p>
                  By accessing, browsing, or using <strong>TempGoldMail</strong> / <strong>GoldMailer</strong> at <strong>goldmailer.xyz</strong> (the "Service"), you agree to be bound by these Terms of Usage ("Terms"). If you do not agree to all provisions of these Terms, please do not use the Service.
                </p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-[#00C07F]/20 text-[#00C07F] text-xs font-bold flex items-center justify-center">2</span>
                  <span>Nature of Disposable Email Service</span>
                </h3>
                <p>
                  GoldMailer provides ephemeral, disposable email inboxes under the <code>goldmailer.xyz</code> domain.
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                  <li><strong>Temporary Retention:</strong> Inboxes are meant for non-permanent communications, registrations, service testing, and spam insulation. We make no guarantee of indefinite retention for free tier inboxes.</li>
                  <li><strong>No Outbound Sending:</strong> GoldMailer is an inbound receiving service. The Service is not configured to send unsolicited outbound communications.</li>
                  <li><strong>User Responsibility:</strong> Do not use temporary email addresses for critical financial, government, or medical accounts that require permanent identity recovery.</li>
                </ul>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-[#00C07F]/20 text-[#00C07F] text-xs font-bold flex items-center justify-center">3</span>
                  <span>Acceptable Use & Anti-Abuse Standards</span>
                </h3>
                <p>
                  You agree to use GoldMailer only for lawful purposes. You shall not utilize the Service to:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                  <li>Engage in, facilitate, or promote cybercrime, identity fraud, phishing campaigns, or unauthorized system access.</li>
                  <li>Evade rate limits or conduct automated denial-of-service (DoS) attempts against the goldmailer.xyz infrastructure or third parties.</li>
                  <li>Receive, store, or distribute illicit, defamatory, threatening, or infringing digital content.</li>
                  <li>Circumvent licensing or abuse trial periods in violation of applicable laws.</li>
                </ul>
                <p className="text-zinc-400 pt-1">
                  We reserve the absolute right to block, filter, or blacklist any inbound address or IP pattern violating these anti-abuse standards.
                </p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-[#00C07F]/20 text-[#00C07F] text-xs font-bold flex items-center justify-center">4</span>
                  <span>Intellectual Property</span>
                </h3>
                <p>
                  All software code, visual design, icons, trade dress, trademarks, and logos associated with TempGoldMail and goldmailer.xyz are protected intellectual property. You may not reverse engineer, resell, or distribute the service interface without prior written authorization.
                </p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-[#00C07F]/20 text-[#00C07F] text-xs font-bold flex items-center justify-center">5</span>
                  <span>Disclaimer of Warranties & Limitation of Liability</span>
                </h3>
                <p>
                  THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
                </p>
                <p className="text-zinc-400">
                  GoldMailer does not warrant uninterrupted availability, zero loss of email messages, or immediate receipt of all third-party emails. In no event shall GoldMailer, its maintainers, or infrastructure providers (Cloudflare, Supabase) be liable for indirect, punitive, or consequential damages resulting from the use or inability to use the service.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-zinc-800">
              <button
                onClick={() => setActiveTab('privacy')}
                className="text-xs text-[#00C07F] font-bold hover:underline flex items-center space-x-1"
              >
                <span>Read Privacy Policy</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onBackToApp}
                className="px-4 py-2 rounded-xl bg-[#00C07F] text-black font-extrabold text-xs shadow-md"
              >
                Back to Webmail
              </button>
            </div>
          </div>
        )}

        {/* ================= 3. PRIVACY POLICY ================= */}
        {activeTab === 'privacy' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="border-b border-zinc-800 pb-4">
              <div className="flex items-center space-x-2 text-xs text-cyan-400 font-semibold mb-1">
                <Shield className="w-4 h-4" />
                <span>Data Protection & Privacy</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Privacy Policy
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Zero-logging guarantee • Published for <strong>goldmailer.xyz</strong>
              </p>
            </div>

            <div className="space-y-6 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">1</span>
                  <span>Our Fundamental Privacy Promise</span>
                </h3>
                <p>
                  TempGoldMail was engineered with a strict <strong>Privacy-First & Zero-Tracking Philosophy</strong>. We believe your online identities and communications are your own business.
                </p>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1.5 text-zinc-400">
                  <div className="flex items-center space-x-2 text-white font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#00C07F]" />
                    <span>No IP Address Logging</span>
                  </div>
                  <div className="flex items-center space-x-2 text-white font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#00C07F]" />
                    <span>No Third-Party Advertising Trackers or Beacons</span>
                  </div>
                  <div className="flex items-center space-x-2 text-white font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#00C07F]" />
                    <span>No Selling or Renting of User Data</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">2</span>
                  <span>Information We Process</span>
                </h3>
                <p>
                  When an email is sent by a third party to an address ending in <code>@goldmailer.xyz</code>:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                  <li><strong>Sender & Recipient Headers:</strong> Read dynamically by Cloudflare Catch-All Email Routing to place the message in the correct inbox.</li>
                  <li><strong>Subject & Message Body:</strong> Parsed via standard MIME decoders to render readable text and HTML in your sandboxed viewer.</li>
                  <li><strong>Browser Local Storage:</strong> Stored locally in your client device browser (localStorage) so you retain your addresses between visits without requiring server cookies.</li>
                </ul>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">3</span>
                  <span>Sandboxed Email Security</span>
                </h3>
                <p>
                  To prevent malicious senders from executing JavaScript, hijacking session cookies, or triggering tracking web-bugs, all received HTML emails are rendered within a strictly sandboxed <code>&lt;iframe sandbox="allow-same-origin"&gt;</code> element. External scripts and unsanctioned code execution are automatically prohibited.
                </p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">4</span>
                  <span>Data Retention & Immediate Deletion</span>
                </h3>
                <p>
                  You hold full control over the lifespan of your data:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                  <li>You can permanently delete any received email with the tap of a button.</li>
                  <li>You can delete any created address from your account at any time, removing all associated inbox records.</li>
                  <li>Emails that are not claimed or retained in active sessions are periodically purged to ensure database cleanliness.</li>
                </ul>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">5</span>
                  <span>GDPR & CCPA Rights</span>
                </h3>
                <p>
                  Under European General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA), users have rights to access, rectify, and erase any personal data. Because we do not store identifying user profiles for anonymous sessions, clicking "Delete Address" or clearing your browser cache purges all associated local data instantly.
                </p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-base text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">6</span>
                  <span>Contact Information</span>
                </h3>
                <p>
                  For privacy inquiries, DMCA notices, or technical reporting regarding <strong>goldmailer.xyz</strong>, contact our privacy maintainers via the in-app "Report & Contact" dialog or at <code>privacy@goldmailer.xyz</code>.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-zinc-800">
              <button
                onClick={() => setActiveTab('terms')}
                className="text-xs text-zinc-400 hover:text-white flex items-center space-x-1"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                <span>Review Terms of Usage</span>
              </button>

              <button
                onClick={onBackToApp}
                className="px-4 py-2 rounded-xl bg-[#00C07F] text-black font-extrabold text-xs shadow-md"
              >
                Back to Webmail
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222222] py-8 px-4 text-center text-xs text-zinc-500 space-y-2">
        <div className="flex items-center justify-center space-x-4">
          <button onClick={() => setActiveTab('hero')} className="hover:text-zinc-300">Overview</button>
          <span>•</span>
          <button onClick={() => setActiveTab('terms')} className="hover:text-zinc-300">Terms of Usage</button>
          <span>•</span>
          <button onClick={() => setActiveTab('privacy')} className="hover:text-zinc-300">Privacy Policy</button>
          <span>•</span>
          <button onClick={onBackToApp} className="text-[#00C07F] font-bold hover:underline">Launch Webmail</button>
        </div>
        <p>
          Version 7.4.0 Beta • TempGoldMail • Powered by Cloudflare Email Routing & Supabase • goldmailer.xyz
        </p>
      </footer>
    </div>
  );
};
