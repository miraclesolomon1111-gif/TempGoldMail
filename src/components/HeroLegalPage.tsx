import React, { useState, useEffect } from 'react';
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
  Moon,
  ExternalLink,
  ChevronRight,
  Inbox,
  UserCheck,
  EyeOff,
  Server
} from 'lucide-react';
import { UserProfile } from '../types';

interface HeroLegalPageProps {
  onBackToApp: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onGetStarted?: () => void;
  onOpenOAuthDev: () => void;
  initialSection?: 'hero' | 'terms' | 'privacy';
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user?: UserProfile | null;
}

export const HeroLegalPage: React.FC<HeroLegalPageProps> = ({
  onBackToApp,
  onOpenLogin,
  onOpenRegister,
  onGetStarted,
  onOpenOAuthDev,
  initialSection = 'hero',
  darkMode,
  onToggleDarkMode,
  user
}) => {
  const [activeTab, setActiveTab] = useState<'hero' | 'terms' | 'privacy'>(initialSection);

  useEffect(() => {
    if (initialSection) {
      setActiveTab(initialSection);
    }
  }, [initialSection]);

  const handlePrimaryGetStarted = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      onOpenRegister();
    }
  };

  return (
    <div className={`min-h-screen transition-colors ${darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'}`}>
      {/* Top Glass Navigation Bar */}
      <nav className={`sticky top-0 z-50 px-4 py-3 border-b backdrop-blur-xl ${
        darkMode ? 'bg-[#121214]/85 border-white/10' : 'bg-white/85 border-orange-200/50 shadow-xs'
      }`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Brand Logo */}
          <div
            className="flex items-center space-x-3 cursor-pointer select-none"
            onClick={() => setActiveTab('hero')}
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center shadow-lg shadow-[#FF6A00]/25 text-white font-black text-xl">
              G
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] bg-clip-text text-transparent">
                  GoldMailer
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#FF6A00]/15 text-[#FF8C42] rounded-full border border-[#FF6A00]/30">
                  xyz
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium hidden sm:block">Permanent Webmail & Communications</p>
            </div>
          </div>

          {/* Section Navigation Tabs (Desktop) */}
          <div className={`hidden md:flex items-center space-x-1 p-1 rounded-2xl border text-xs font-semibold ${
            darkMode ? 'bg-white/5 border-white/10' : 'bg-orange-50 border-orange-200/60'
          }`}>
            <button
              type="button"
              onClick={() => setActiveTab('hero')}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'hero' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'privacy' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'terms' ? 'bg-[#FF6A00] text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Terms of Usage
            </button>
          </div>

          {/* Actions: Theme Toggle + Webmail Link + [Get Started] Button */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                darkMode ? 'bg-white/10 hover:bg-white/15 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
              }`}
              title="Toggle Light / Dark mode"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4 text-[#FF8C42]" /> : <Moon className="w-4 h-4 text-zinc-700" />}
            </button>

            {user ? (
              <button
                type="button"
                onClick={onBackToApp}
                className="px-3 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-[#FF6A00]/40 text-xs font-bold text-[#FF8C42] transition-all cursor-pointer"
              >
                Go to Mailbox
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className={`px-3 py-2 text-xs font-semibold hover:text-[#FF6A00] transition-colors cursor-pointer hidden sm:inline-block ${
                  darkMode ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                Sign In
              </button>
            )}

            {/* Prominent [Get Started] Button */}
            <button
              type="button"
              onClick={handlePrimaryGetStarted}
              className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs (Mobile Sub-bar) */}
        <div className="flex md:hidden items-center justify-center space-x-2 mt-2 pt-2 border-t border-white/5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('hero')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'hero' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'privacy' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'terms' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400'
            }`}
          >
            Terms
          </button>
        </div>
      </nav>

      {/* Main Tab Content */}
      {activeTab === 'hero' ? (
        <main className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
          {/* Hero Section */}
          <section className="text-center max-w-4xl mx-auto space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-xs font-semibold text-[#FF8C42] shadow-sm">
              <Sparkles className="w-4 h-4 text-[#FF6A00]" />
              <span>Permanent Webmail & Communications Provider · Domain: goldmailer.xyz</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15]">
              Fast, Private & Secure Email{' '}
              <span className="block mt-1 sm:mt-2 bg-gradient-to-r from-[#FF6A00] via-[#FF8C42] to-[#FFB266] bg-clip-text text-transparent">
                Engineered for Everyone
              </span>
            </h1>

            <p className="text-base sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              GoldMailer is a modern, high-speed communications suite providing <strong>15GB permanent cloud storage</strong>, seamless Gmail synchronization via OAuth, military-grade 2-Step Verification, and an open OAuth 2.0 Identity Provider.
            </p>

            {/* Single Standout [Get Started] Call to Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={handlePrimaryGetStarted}
                className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-extrabold text-base shadow-xl shadow-[#FF6A00]/35 hover:shadow-[#FF6A00]/50 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 font-medium pt-1">
              No credit card required · Free 15GB permanent mailbox · Instant account activation
            </p>
          </section>

          {/* Detailed "What is GoldMailer?" Long-Form Section */}
          <section className="mt-20 max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                What is GoldMailer?
              </h2>
              <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
                A complete, private, and permanent communications infrastructure designed for the modern web.
              </p>
            </div>

            <div className={`p-6 sm:p-8 rounded-3xl border leading-relaxed space-y-4 text-sm sm:text-base ${
              darkMode ? 'bg-white/5 border-white/10 text-zinc-300' : 'bg-white border-orange-200/50 text-zinc-700 shadow-sm'
            }`}>
              <p>
                <strong>GoldMailer</strong> (hosted publicly at <code>goldmailer.xyz</code>) is an independent, permanent email service and unified communications hub. In an era where email accounts are either locked behind invasive tracking or fragile temporary inboxes that expire after a few minutes, GoldMailer delivers the best of both worlds: <strong>permanent ownership</strong> of your inbox, high-speed inbound delivery, robust privacy controls, and a generous <strong>15GB cloud storage quota</strong> for every registered user.
              </p>

              <p>
                Whether you are an individual wanting a clean, ad-free address for personal correspondence, an online professional managing multiple identities, or a developer integrating third-party sign-in, GoldMailer offers a fast, reliable web interface inspired by familiar desktop mail clients.
              </p>

              <p>
                Through our integrated <strong>Gmail Aggregation & Auto-Forwarding Hub</strong>, users can also securely connect their existing Gmail inboxes via Google OAuth 2.0. This allows you to view, read, search, and organize your external Gmail messages alongside your GoldMailer correspondence in a unified inbox without juggling multiple browser tabs or disparate apps.
              </p>
            </div>
          </section>

          {/* 6 Core Feature Highlights */}
          <section className="mt-20">
            <div className="text-center space-y-3 mb-10">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                Built with Exceptional Capabilities
              </h2>
              <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto">
                Everything you need for seamless, private, and high-performance communication.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Feature 1: 15GB storage */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                  <HardDrive className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">15GB Permanent Storage</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Every account receives a high-capacity permanent mailbox quota for messages, attachments, and archives. Your emails never expire.
                </p>
              </div>

              {/* Feature 2: Gmail Integration */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-500">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">Gmail Aggregation & Sync</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Connect your existing Gmail accounts via Google OAuth 2.0. Aggregate incoming emails and search your messages in a unified inbox view.
                </p>
              </div>

              {/* Feature 3: Bank-Grade Security */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-[#FF8C42]/15 flex items-center justify-center text-[#FF8C42]">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">Bank-Grade Encryption</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Bcrypt salted password encryption, TLS 1.3 in-transit security, AES-256 data protection, and real-time device anomaly detection.
                </p>
              </div>

              {/* Feature 4: 2-step verification */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">2-Step Verification (2FA)</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  TOTP authenticator app support (Google Authenticator, Authy, 1Password) with 10 single-use emergency backup recovery keys.
                </p>
              </div>

              {/* Feature 5: 250+ Countries */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">250+ Countries Phone Hub</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Global SMS carrier verification and phone number management for international security, recovery, and communication.
                </p>
              </div>

              {/* Feature 6: Fast */}
              <div className={`p-6 rounded-3xl border transition-all space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10 hover:border-[#FF6A00]/40' : 'bg-white border-orange-200/60 shadow-xs'
              }`}>
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">Lightning-Fast Delivery</h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Instant inbound email delivery in milliseconds, real-time background sync, and smooth mobile and desktop responsiveness.
                </p>
              </div>
            </div>
          </section>

          {/* How GoldMailer Works in 3 Steps */}
          <section className="mt-20 max-w-4xl mx-auto space-y-10">
            <div className="text-center space-y-3">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                How GoldMailer Works in 3 Steps
              </h2>
              <p className="text-sm sm:text-base text-zinc-400 max-w-md mx-auto">
                Get up and running with your permanent mailbox in under 30 seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`p-6 rounded-3xl border space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-orange-200/60'
              }`}>
                <div className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center font-extrabold text-sm">
                  1
                </div>
                <h4 className="font-bold text-base">Click [Get Started]</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Choose your preferred @goldmailer.xyz username and password. No personal credit card or complicated verification required.
                </p>
              </div>

              <div className={`p-6 rounded-3xl border space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-orange-200/60'
              }`}>
                <div className="w-8 h-8 rounded-full bg-[#FF8C42] text-white flex items-center justify-center font-extrabold text-sm">
                  2
                </div>
                <h4 className="font-bold text-base">Secure & Connect</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Turn on 2-Step Verification for ironclad security, and optionally link your Gmail account to manage external email feeds.
                </p>
              </div>

              <div className={`p-6 rounded-3xl border space-y-3 ${
                darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-orange-200/60'
              }`}>
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-extrabold text-sm">
                  3
                </div>
                <h4 className="font-bold text-base">Enjoy Permanent Email</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Receive messages, store 15GB of attachments, compose replies, and access your inbox from any desktop or mobile browser.
                </p>
              </div>
            </div>
          </section>

          {/* OAuth 2.0 Feature Banner */}
          <section className={`mt-20 p-8 rounded-3xl border backdrop-blur-2xl flex flex-col md:flex-row items-center justify-between gap-6 ${
            darkMode
              ? 'bg-gradient-to-r from-[#FF6A00]/15 via-[#FF8C42]/10 to-transparent border-[#FF6A00]/30'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="space-y-2 text-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF8C42] uppercase tracking-wider">
                <Code2 className="w-4 h-4" />
                <span>OAuth 2.0 Identity Provider</span>
              </div>
              <h3 className="text-2xl font-bold">
                Integrate "Continue with GoldMailer" into your apps
              </h3>
              <p className="text-sm text-zinc-400 max-w-xl">
                Allow your application users to sign in with their permanent GoldMailer accounts. Endpoints available at <code>/api/oauth/authorize</code>, <code>/api/oauth/token</code>, and <code>/api/oauth/userinfo</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenOAuthDev}
              className="px-6 py-3.5 rounded-2xl bg-[#FF6A00]/20 hover:bg-[#FF6A00]/30 border border-[#FF6A00]/50 text-[#FF8C42] font-bold text-sm transition-all whitespace-nowrap shadow-lg cursor-pointer"
            >
              Open Developer Portal
            </button>
          </section>

          {/* Bottom Call to Action */}
          <section className="mt-20 text-center max-w-2xl mx-auto space-y-6 pb-6">
            <h2 className="text-3xl font-extrabold">Ready to upgrade your email experience?</h2>
            <p className="text-sm text-zinc-400">
              Join GoldMailer today for a free permanent 15GB mailbox, advanced 2FA, and unified inbox aggregation.
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handlePrimaryGetStarted}
                className="px-10 py-4 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-extrabold text-base shadow-xl shadow-[#FF6A00]/35 hover:shadow-[#FF6A00]/50 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Get Started Now</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </section>
        </main>
      ) : activeTab === 'privacy' ? (
        /* Comprehensive 600+ Word Privacy Policy */
        <main className="max-w-4xl mx-auto px-4 py-12 space-y-8 text-zinc-300">
          <div className="space-y-3 border-b border-white/10 pb-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF8C42] uppercase tracking-wider">
              <Shield className="w-4 h-4" />
              <span>Official Privacy Policy & Google API Disclosure</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Privacy Policy for GoldMailer</h1>
            <p className="text-xs text-zinc-400">
              Domain: <strong className="text-white">goldmailer.xyz</strong> · Effective Date: <strong className="text-white">October 26, 2026</strong> · Last Reviewed: October 26, 2026
            </p>
          </div>

          {/* Highlight Box */}
          <div className="p-5 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-xs sm:text-sm leading-relaxed text-zinc-200 space-y-2">
            <div className="font-bold text-[#FF8C42] flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>Our Core Privacy Commitment</span>
            </div>
            <p>
              GoldMailer respects your privacy as a fundamental right. We do NOT sell, rent, monetize, or transfer your email data, correspondence, or personal credentials to third-party advertisers or data brokers. All data is encrypted, access is strictly user-controlled, and you may permanently revoke access and delete your information at any time.
            </p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed">
            {/* 1. What is GoldMailer */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">1.</span> What is GoldMailer?
              </h2>
              <p>
                <strong>GoldMailer</strong> is a cloud-based permanent email and communication platform operating at <strong>https://goldmailer.xyz</strong>. GoldMailer provides individuals, professionals, and developers with dedicated <code>@goldmailer.xyz</code> mailboxes featuring 15GB of persistent storage, 2-Step Verification (2FA / TOTP), modern webmail interfaces, international SMS carrier verification, and an open OAuth 2.0 identity provider.
              </p>
              <p>
                In addition to native mailbox hosting, GoldMailer provides an optional <em>Gmail Aggregation & Sync Hub</em> that enables users to connect external email accounts via standard Google OAuth 2.0 protocols to view and organize their correspondence in a unified interface.
              </p>
            </section>

            {/* 2. What Gmail Data We Collect */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">2.</span> What Gmail Data We Collect
              </h2>
              <p>
                When you explicitly choose to connect your Google or Gmail account to GoldMailer via Google OAuth 2.0, our application requests access solely to the permissions necessary to deliver the email viewing and organization features. Specifically, we collect and process:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                <li>
                  <strong className="text-zinc-200">Google Account Profile Information:</strong> Your Google primary email address and basic profile identifier, used to verify ownership and bind the connected mailbox to your GoldMailer account.
                </li>
                <li>
                  <strong className="text-zinc-200">Gmail Message Metadata:</strong> Message IDs, thread IDs, date and time received, sender email address (From:), recipient email address (To:, Cc:), and message subject line.
                </li>
                <li>
                  <strong className="text-zinc-200">Gmail Message Content:</strong> The plain text and HTML body content and attachment metadata of emails received in your connected Gmail account, retrieved strictly via Google's official Gmail REST API over secure HTTPS connections.
                </li>
                <li>
                  <strong className="text-zinc-200">OAuth Access and Refresh Tokens:</strong> Cryptographically generated authorization tokens issued directly by Google after you consent on Google's authorization screen. We never ask for, see, or store your Google account password.
                </li>
              </ul>
            </section>

            {/* 3. Why We Collect It */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">3.</span> Why We Collect It (Purpose of Processing)
              </h2>
              <p>
                We collect and process your Gmail data for one exclusive purpose:
              </p>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-zinc-200">
                <strong>To display, synchronize, organize, and render your emails inside the GoldMailer unified inbox.</strong>
              </div>
              <p>
                This functionality allows you to read messages, view replies, preview attachments, and search your correspondence without leaving the GoldMailer application. We do NOT use your Gmail data for any secondary purpose, including advertising, market research, credit scoring, algorithmic profiling, or training generalized artificial intelligence or machine learning models.
              </p>
            </section>

            {/* 4. How We Store and Protect Your Data */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">4.</span> How We Store and Protect Your Data
              </h2>
              <p>
                Security is integral to GoldMailer's architecture. We protect your personal data and synchronized messages through defense-in-depth security measures:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                <li>
                  <strong className="text-zinc-200">Encryption in Transit:</strong> All communications between your browser, our servers, and Google's API endpoints are encrypted using Transport Layer Security (TLS 1.3 / HTTPS). Plaintext transmission of credentials or message contents is strictly prohibited.
                </li>
                <li>
                  <strong className="text-zinc-200">Encryption at Rest:</strong> OAuth access tokens, refresh tokens, and synchronized email records stored in our database are encrypted at rest using AES-256 standard encryption algorithms.
                </li>
                <li>
                  <strong className="text-zinc-200">Password Hashing:</strong> User account passwords for GoldMailer are hashed using salted Bcrypt with a high work factor. Raw passwords are never stored in plaintext anywhere on our infrastructure.
                </li>
                <li>
                  <strong className="text-zinc-200">Access Isolation:</strong> Access to stored email cache is isolated by authenticated user session tokens. No user can view or access data belonging to another user.
                </li>
              </ul>
            </section>

            {/* 5. We Do NOT Sell or Share Gmail Data */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">5.</span> Prohibition on Selling or Sharing Gmail Data
              </h2>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                <strong>Strict Zero-Sharing Guarantee:</strong> GoldMailer does NOT sell, rent, license, barter, or transfer your Gmail data or personal communications to any third parties, advertisers, data brokers, or affiliates.
              </div>
              <p>
                We will never disclose your Gmail data to third parties unless required by law or a valid, enforceable court order issued by a court of competent jurisdiction. In such rare instances, we provide prompt notification to the affected user where legally permissible.
              </p>
            </section>

            {/* 6. Google API Services User Data Policy Compliance */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">6.</span> Google API Services User Data Policy & Limited Use
              </h2>
              <p>
                GoldMailer's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FF8C42] underline hover:text-[#FF6A00] inline-flex items-center gap-1"
                >
                  Google API Services User Data Policy
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
                , including the <strong>Limited Use</strong> requirements:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                <li>We only use Google data to provide user-facing features that are prominent in GoldMailer's user interface.</li>
                <li>We do not transfer data to third parties unless necessary to provide or improve these features, comply with applicable law, or as part of a merger/acquisition.</li>
                <li>We do not use or transfer the data to serve advertisements, including personalized, retargeted, or interest-based ads.</li>
                <li>We do not allow humans to read user data unless we have obtained your affirmative consent for specific messages, it is necessary for security purposes (such as investigating a bug or abuse), or to comply with applicable law.</li>
              </ul>
            </section>

            {/* 7. How User Can Delete Data and Revoke Access */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">7.</span> How to Delete Data and Revoke Access
              </h2>
              <p>
                You maintain complete ownership of your data at all times. You can disconnect your Google account and remove all synchronized email data using either of the following methods:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <h4 className="font-bold text-white flex items-center gap-2 text-sm">
                    <UserCheck className="w-4 h-4 text-[#FF8C42]" />
                    Option A: Inside GoldMailer
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Navigate to <strong>Settings → Connected Emails</strong> inside your GoldMailer dashboard and click <strong>"Disconnect Account"</strong>. All associated OAuth tokens and locally cached emails will be immediately and permanently deleted from our servers.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <h4 className="font-bold text-white flex items-center gap-2 text-sm">
                    <EyeOff className="w-4 h-4 text-[#FF8C42]" />
                    Option B: Via Google Permissions Portal
                  </h4>
                  <p className="text-xs text-zinc-400">
                    You can revoke GoldMailer's access directly at any time by visiting Google's official third-party apps permissions management page:
                  </p>
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF8C42] hover:underline"
                  >
                    <span>myaccount.google.com/permissions</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-[11px] text-zinc-500">
                    Locate "GoldMailer", click on it, and select "Remove Access". Google will immediately invalidate all existing authorization tokens.
                  </p>
                </div>
              </div>
            </section>

            {/* 8. Contact Information */}
            <section className="space-y-3 pt-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-[#FF6A00]">8.</span> Contact Us
              </h2>
              <p>
                If you have any questions, concerns, feedback, or requests regarding this Privacy Policy, your personal data, or our security practices, please contact our dedicated privacy and security team:
              </p>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-sm">
                <div>
                  <span className="text-zinc-400">Email: </span>
                  <a href="mailto:support@goldmailer.xyz" className="text-[#FF8C42] font-bold hover:underline">
                    support@goldmailer.xyz
                  </a>
                </div>
                <div>
                  <span className="text-zinc-400">Website: </span>
                  <a href="https://goldmailer.xyz" className="text-white hover:underline">
                    https://goldmailer.xyz
                  </a>
                </div>
                <div>
                  <span className="text-zinc-400">Effective Date: </span>
                  <span className="text-white font-medium">October 26, 2026</span>
                </div>
              </div>
            </section>
          </div>
        </main>
      ) : (
        /* Terms of Usage Tab */
        <main className="max-w-4xl mx-auto px-4 py-12 space-y-6 text-zinc-300">
          <div className="space-y-3 border-b border-white/10 pb-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF8C42] uppercase tracking-wider">
              <FileText className="w-4 h-4" />
              <span>Terms of Service</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white">Terms of Usage</h1>
            <p className="text-xs text-zinc-400">Effective Date: October 26, 2026 · Domain: goldmailer.xyz</p>
          </div>

          <div className="space-y-4 text-xs sm:text-sm leading-relaxed p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-base font-bold text-white">1. Account Ownership & Allocation</h3>
            <p>
              Each account registered under @goldmailer.xyz is unique, permanent, and secured by your chosen credentials and optional 2-Step Verification. Accounts are allocated 15GB of cloud storage quota for valid personal and commercial communications.
            </p>
            <h3 className="text-base font-bold text-white">2. Acceptable Use Policy</h3>
            <p>
              Users agree not to transmit spam, bulk unsolicited commercial emails, malware, phishing links, or defamatory content. Accounts found violating these rules are subject to immediate termination.
            </p>
            <h3 className="text-base font-bold text-white">3. OAuth Provider Integration</h3>
            <p>
              Third-party developers integrating "Continue with GoldMailer" must honor user privacy, request only the necessary scopes, and display standard consent screens.
            </p>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="mt-20 py-8 border-t border-white/10 text-center text-xs text-zinc-500 space-y-2">
        <p>GoldMailer · Fast, Private & Secure Permanent Email · <strong>goldmailer.xyz</strong> · 15GB Cloud Storage</p>
        <div className="flex items-center justify-center space-x-4 text-zinc-400">
          <button
            type="button"
            onClick={() => setActiveTab('hero')}
            className="hover:text-white cursor-pointer"
          >
            Overview
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className="hover:text-white cursor-pointer"
          >
            Privacy Policy
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className="hover:text-white cursor-pointer"
          >
            Terms of Usage
          </button>
          <span>·</span>
          <a href="mailto:support@goldmailer.xyz" className="hover:text-white">
            support@goldmailer.xyz
          </a>
        </div>
      </footer>
    </div>
  );
};
