import React, { useState } from 'react';
import {
  Shield,
  FileText,
  Mail,
  Zap,
  Lock,
  CheckCircle2,
  ArrowRight,
  Globe,
  HardDrive,
  KeyRound,
  Sparkles,
  Smartphone,
  Code2,
  Sun,
  Moon
} from 'lucide-react';

interface HeroLegalPageProps {
  onBackToApp: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenOAuthDev: () => void;
  initialSection?: 'hero' | 'terms' | 'privacy';
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const HeroLegalPage: React.FC<HeroLegalPageProps> = ({
  onBackToApp,
  onOpenLogin,
  onOpenRegister,
  onOpenOAuthDev,
  initialSection = 'hero',
  darkMode,
  onToggleDarkMode
}) => {
  const [activeTab, setActiveTab] = useState<'hero' | 'terms' | 'privacy'>(initialSection);

  return (
    <div className={`min-h-screen transition-colors ${darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'}`}>
      {/* Top Glass Navigation Bar */}
      <nav className={`sticky top-0 z-50 px-4 py-3 border-b backdrop-blur-xl ${
        darkMode ? 'bg-[#121214]/85 border-white/10' : 'bg-white/80 border-orange-200/50'
      }`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => setActiveTab('hero')}
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center shadow-lg shadow-[#FF6A00]/25 text-white font-extrabold text-xl">
              G
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] bg-clip-text text-transparent">
                GoldMailer
              </span>
              <span className="ml-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#FF6A00]/15 text-[#FF8C42] rounded-full border border-[#FF6A00]/30">
                xyz
              </span>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="hidden md:flex items-center space-x-1 p-1 bg-white/5 rounded-2xl border border-white/10 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('hero')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'hero' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'terms' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Terms of Usage
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'privacy' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Privacy Policy
            </button>
          </div>

          {/* Actions: Theme Toggle + Login + Get Started */}
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white transition-colors"
              title="Toggle Light / Dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4 text-[#FF8C42]" /> : <Moon className="w-4 h-4 text-zinc-800" />}
            </button>

            <button
              type="button"
              onClick={onOpenLogin}
              className="px-3.5 py-2 rounded-xl border border-[#FF6A00]/30 hover:border-[#FF6A00] text-xs font-bold transition-all text-[#FF8C42] hover:bg-[#FF6A00]/10 cursor-pointer"
            >
              Log into your GoldMailer Account
            </button>

            <button
              type="button"
              onClick={onOpenRegister}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-extrabold text-xs shadow-lg shadow-[#FF6A00]/25 hover:shadow-[#FF6A00]/40 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Create Account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Tab Content */}
      {activeTab === 'hero' ? (
        <main className="max-w-6xl mx-auto px-4 py-12 sm:py-20">
          {/* Hero Section */}
          <section className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-xs font-semibold text-[#FF8C42] shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Permanent Gmail-Style Provider · Domain: goldmailer.xyz</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
              Fast, Secure Email{' '}
              <span className="bg-gradient-to-r from-[#FF6A00] via-[#FF8C42] to-[#FFB266] bg-clip-text text-transparent">
                for Everyone
              </span>
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Step into the modern era of email. Experience 15GB permanent storage, military-grade 2-Step Verification, instant draft auto-saving, and an OAuth 2.0 provider that lets third-party apps add <em>"Continue with GoldMailer"</em>.
            </p>

            {/* Orange Glass Call to Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={onOpenRegister}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-base shadow-xl shadow-[#FF6A00]/35 hover:shadow-[#FF6A00]/50 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <span>Create a GoldMailer Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenLogin}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-[#FF6A00]/50 text-white font-bold text-base backdrop-blur-xl transition-all flex items-center justify-center gap-2 cursor-pointer hover:border-[#FF6A00]"
              >
                <span>Log into your GoldMailer Account</span>
              </button>
            </div>
          </section>

          {/* 5 Core Feature Highlights (From user prompt) */}
          <section className="mt-20 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Feature 1: 15GB storage */}
            <div className="p-6 rounded-3xl bg-white/5 border border-[#FF6A00]/20 backdrop-blur-xl hover:border-[#FF6A00]/40 transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">15GB Storage</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Generous high-capacity permanent mailbox quota for all your messages, attachments, and archives.
              </p>
            </div>

            {/* Feature 2: Secure */}
            <div className="p-6 rounded-3xl bg-white/5 border border-[#FF6A00]/20 backdrop-blur-xl hover:border-[#FF6A00]/40 transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF8C42]/15 flex items-center justify-center text-[#FF8C42]">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Bank-Grade Secure</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Bcrypt password encryption, IP suspicious device protection, and atomic address locking.
              </p>
            </div>

            {/* Feature 3: 250+ Countries */}
            <div className="p-6 rounded-3xl bg-white/5 border border-[#FF6A00]/20 backdrop-blur-xl hover:border-[#FF6A00]/40 transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">250+ Countries</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Global SMS phone verification and recovery options for international security and trust.
              </p>
            </div>

            {/* Feature 4: 2-step verification */}
            <div className="p-6 rounded-3xl bg-white/5 border border-[#FF6A00]/20 backdrop-blur-xl hover:border-[#FF6A00]/40 transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF8C42]/15 flex items-center justify-center text-[#FF8C42]">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">2-Step Verification</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                TOTP Authenticator app QR code pairing + 10 single-use emergency backup recovery codes.
              </p>
            </div>

            {/* Feature 5: Fast */}
            <div className="p-6 rounded-3xl bg-white/5 border border-[#FF6A00]/20 backdrop-blur-xl hover:border-[#FF6A00]/40 transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Lightning Fast</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Inbound delivery in milliseconds, real-time sync, and smooth Gmail-style glassmorphism interface.
              </p>
            </div>
          </section>

          {/* OAuth 2.0 Feature Banner */}
          <section className="mt-16 p-8 rounded-3xl bg-gradient-to-r from-[#FF6A00]/15 via-[#FF8C42]/10 to-transparent border border-[#FF6A00]/30 backdrop-blur-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF8C42] uppercase tracking-wider">
                <Code2 className="w-4 h-4" />
                <span>OAuth 2.0 Identity Provider</span>
              </div>
              <h3 className="text-2xl font-bold text-white">
                Integrate "Continue with GoldMailer" into your apps
              </h3>
              <p className="text-sm text-zinc-300 max-w-xl">
                Offer your users a clean sign-in button just like Continue with Google. Endpoints available at <code>/api/oauth/authorize</code>, <code>/api/oauth/token</code>, and <code>/api/oauth/userinfo</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenOAuthDev}
              className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-[#FF6A00]/40 text-white font-bold text-sm transition-all whitespace-nowrap shadow-lg"
            >
              Open Developer Portal
            </button>
          </section>
        </main>
      ) : activeTab === 'terms' ? (
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6 text-zinc-300">
          <h2 className="text-3xl font-extrabold text-white">Terms of Usage</h2>
          <p className="text-sm">
            Welcome to GoldMailer (goldmailer.xyz). By accessing or using our permanent email platform, you agree to comply with our Terms of Service.
          </p>
          <div className="space-y-4 text-xs leading-relaxed p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-base font-bold text-white">1. Account Ownership</h3>
            <p>
              Each account registered under @goldmailer.xyz is unique, permanent, and secured by your chosen password and optional 2-Step Verification. Accounts are allocated 15GB cloud storage.
            </p>
            <h3 className="text-base font-bold text-white">2. Acceptable Use</h3>
            <p>
              Users must not transmit spam, phishing material, malware, or unsolicited commercial messages.
            </p>
            <h3 className="text-base font-bold text-white">3. OAuth Provider Usage</h3>
            <p>
              Third-party developers integrating "Continue with GoldMailer" must honor user privacy and only request authorized scopes.
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6 text-zinc-300">
          <h2 className="text-3xl font-extrabold text-white">Privacy Policy</h2>
          <p className="text-sm">
            Your privacy is our utmost priority at GoldMailer.
          </p>
          <div className="space-y-4 text-xs leading-relaxed p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-base font-bold text-white">1. Data Storage & Encryption</h3>
            <p>
              Passphrases are hashed with bcrypt. Messages are stored securely with end-to-end access control.
            </p>
            <h3 className="text-base font-bold text-white">2. Device & Location Security</h3>
            <p>
              We analyze IP and browser signatures solely to detect suspicious login attempts and protect your account.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-20 py-8 border-t border-white/10 text-center text-xs text-zinc-500">
        <p>GoldMailer · Fast, Secure Permanent Email · goldmailer.xyz · 15GB Cloud Storage</p>
      </footer>
    </div>
  );
};
