import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MailFolder, EmailMessage, UserProfile, Draft } from './types';
import {
  getStoredActiveEmail,
  setStoredActiveEmail,
  getStoredUser,
  setStoredUser,
  clearAuthToken,
  fetchCurrentUser,
  fetchEmails,
  syncEmails,
  fetchDrafts,
  deleteDraft,
  updateEmailStatus,
  deleteEmail
} from './lib/api';

import { GmailHeader } from './components/GmailHeader';
import { GmailDrawer } from './components/GmailDrawer';
import { EmailListView } from './components/EmailListView';
import { EmailDetailModal } from './components/EmailDetailModal';
import { ComposeModal } from './components/ComposeModal';
import { AuthWizardModal } from './components/AuthWizardModal';
import { SuspiciousLoginModal } from './components/SuspiciousLoginModal';
import { DeviceApprovalPrompt } from './components/DeviceApprovalPrompt';
import { OAuthConsentModal } from './components/OAuthConsentModal';
import { OAuthDeveloperModal } from './components/OAuthDeveloperModal';
import { SettingsModal } from './components/SettingsModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { AccountSwitcherSheet } from './components/AccountSwitcherSheet';
import { HeroLegalPage } from './components/HeroLegalPage';

export default function App() {
  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('goldmailer_theme');
    return saved !== 'light';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('goldmailer_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('goldmailer_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  // User State
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [activeEmail, setActiveEmail] = useState<string>(() => {
    const stored = getStoredActiveEmail();
    if (stored) return stored;
    return 'miracle@goldmailer.xyz';
  });

  // View Mode: 'app' (Webmail) vs 'hero' (Landing Page)
  const [viewMode, setViewMode] = useState<'app' | 'hero'>('app');
  const [heroInitialSection, setHeroInitialSection] = useState<'hero' | 'terms' | 'privacy'>('hero');

  // Mailbox State
  const [currentFolder, setCurrentFolder] = useState<MailFolder | 'all_inboxes'>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Modals
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [composeInitialTo, setComposeInitialTo] = useState('');
  const [composeInitialSubject, setComposeInitialSubject] = useState('');
  const [composeInitialBody, setComposeInitialBody] = useState('');

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isOAuthDevOpen, setIsOAuthDevOpen] = useState(false);

  // Suspicious Login Modal
  const [suspiciousLoginData, setSuspiciousLoginData] = useState<any>(null);
  const [isSuspiciousModalOpen, setIsSuspiciousModalOpen] = useState(false);

  // OAuth 2.0 Consent Screen
  const [isOAuthConsentOpen, setIsOAuthConsentOpen] = useState(false);
  const [oauthParams, setOauthParams] = useState<{
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
  }>({
    clientId: '',
    redirectUri: '',
    scope: 'openid email profile',
    state: ''
  });

  // Handle URL Hash and Query Routes
  useEffect(() => {
    const handleRouteCheck = () => {
      const url = new URL(window.location.href);
      const hash = url.hash.toLowerCase();
      const path = url.pathname.toLowerCase();

      // Admin route
      if (path === '/admin' || hash === '#admin') {
        setIsAdminOpen(true);
      }

      // Landing / Hero route
      if (path === '/hero' || hash === '#hero') {
        setViewMode('hero');
        setHeroInitialSection('hero');
      } else if (path === '/terms' || hash === '#terms') {
        setViewMode('hero');
        setHeroInitialSection('terms');
      } else if (path === '/privacy' || hash === '#privacy') {
        setViewMode('hero');
        setHeroInitialSection('privacy');
      }

      // OAuth Consent query
      if (url.searchParams.get('oauth_consent') === 'true' || path === '/oauth/authorize' || path === '/api/oauth/authorize') {
        const cId = url.searchParams.get('client_id') || '';
        const rUri = url.searchParams.get('redirect_uri') || '';
        const scp = url.searchParams.get('scope') || 'openid email profile';
        const st = url.searchParams.get('state') || '';
        if (cId) {
          setOauthParams({ clientId: cId, redirectUri: rUri, scope: scp, state: st });
          setIsOAuthConsentOpen(true);
        }
      }
    };

    handleRouteCheck();
    window.addEventListener('hashchange', handleRouteCheck);
    return () => window.removeEventListener('hashchange', handleRouteCheck);
  }, []);

  // Fetch current user on mount
  useEffect(() => {
    fetchCurrentUser().then((u) => {
      if (u) {
        setUser(u);
        setActiveEmail(u.email);
        setStoredActiveEmail(u.email);
      }
    }).catch(() => {});
  }, []);

  // Load emails and drafts for current folder & active email
  const loadMailData = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingEmails(true);
    try {
      const [emailList, draftList] = await Promise.all([
        fetchEmails(activeEmail, currentFolder),
        fetchDrafts()
      ]);
      setEmails(emailList);
      setDrafts(draftList);
    } catch {
      // safe fallback
    } finally {
      if (!silent) setIsLoadingEmails(false);
    }
  }, [activeEmail, currentFolder]);

  useEffect(() => {
    loadMailData();
  }, [loadMailData]);

  // Periodic automatic sync every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadMailData(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [loadMailData]);

  // Sync Emails action (inbound + historical)
  const handleSyncEmails = async () => {
    setIsSyncing(true);
    try {
      await syncEmails(activeEmail);
      await loadMailData(false);
    } catch (e: any) {
      console.warn('Sync note:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Copy email
  const handleCopyEmail = () => {
    navigator.clipboard.writeText(activeEmail);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Star toggle
  const handleToggleStar = async (emailId: string, currentStarred: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((m) => (m.id === emailId ? { ...m, is_starred: !currentStarred } : m))
    );
    try {
      await updateEmailStatus(emailId, { is_starred: !currentStarred });
    } catch {}
  };

  // Open Compose for new email
  const handleOpenCompose = () => {
    setActiveDraft(null);
    setComposeInitialTo('');
    setComposeInitialSubject('');
    setComposeInitialBody('');
    setIsComposeOpen(true);
  };

  // Open Compose to continue editing a saved draft
  const handleSelectDraft = (draft: Draft) => {
    setActiveDraft(draft);
    setComposeInitialTo(draft.to || '');
    setComposeInitialSubject(draft.subject || '');
    setComposeInitialBody(draft.body || '');
    setIsComposeOpen(true);
  };

  // Delete draft
  const handleDeleteDraft = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    try {
      await deleteDraft(draftId);
    } catch {}
  };

  // Reply handler
  const handleReply = (to: string, subject: string) => {
    setSelectedEmail(null);
    setActiveDraft(null);
    setComposeInitialTo(to);
    setComposeInitialSubject(subject);
    setComposeInitialBody('');
    setIsComposeOpen(true);
  };

  // Forward handler
  const handleForward = (email: EmailMessage) => {
    setSelectedEmail(null);
    setActiveDraft(null);
    setComposeInitialTo('');
    setComposeInitialSubject(`Fwd: ${email.subject}`);
    setComposeInitialBody(`\n\n---------- Forwarded message ---------\nFrom: ${email.sender}\nDate: ${email.received_at}\nSubject: ${email.subject}\nTo: ${email.recipient}\n\n${email.body_text || email.body || ''}`);
    setIsComposeOpen(true);
  };

  // Email Move to trash
  const handleMoveToTrash = async (id: string) => {
    setEmails((prev) => prev.filter((m) => m.id !== id));
    setSelectedEmail(null);
    try {
      await updateEmailStatus(id, { folder: 'trash' });
    } catch {}
  };

  // Email Move to spam
  const handleMoveToSpam = async (id: string) => {
    setEmails((prev) => prev.filter((m) => m.id !== id));
    setSelectedEmail(null);
    try {
      await updateEmailStatus(id, { folder: 'spam' });
    } catch {}
  };

  // Delete email permanently
  const handleDeleteEmail = async (id: string) => {
    setEmails((prev) => prev.filter((m) => m.id !== id));
    setSelectedEmail(null);
    try {
      await deleteEmail(id, true);
    } catch {}
  };

  // Auth Success
  const handleAuthSuccess = (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setActiveEmail(authenticatedUser.email);
    setStoredActiveEmail(authenticatedUser.email);
    setStoredUser(authenticatedUser);
    setViewMode('app');
    loadMailData();
  };

  // Suspicious login detected during sign-in
  const handleSuspiciousLoginDetected = (data: any) => {
    setSuspiciousLoginData(data);
    setIsSuspiciousModalOpen(true);
  };

  // Logout
  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
    setActiveEmail('miracle@goldmailer.xyz');
    setStoredActiveEmail('miracle@goldmailer.xyz');
    setViewMode('hero');
  };

  // Unread / count metrics for folders
  const unreadCounts = {
    primary: emails.filter((e) => !e.is_read && e.folder === 'primary').length,
    promotions: emails.filter((e) => !e.is_read && e.folder === 'promotions').length,
    social: emails.filter((e) => !e.is_read && e.folder === 'social').length,
    updates: emails.filter((e) => !e.is_read && e.folder === 'updates').length,
    starred: emails.filter((e) => e.is_starred).length,
    sent: emails.filter((e) => e.folder === 'sent').length,
    scheduled: emails.filter((e) => e.folder === 'scheduled').length,
    drafts: drafts.length,
    all_mail: emails.length,
    spam: emails.filter((e) => e.folder === 'spam').length,
    trash: emails.filter((e) => e.folder === 'trash').length
  };

  // Filter emails by search query
  const filteredEmails = emails.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.subject && e.subject.toLowerCase().includes(q)) ||
      (e.sender && e.sender.toLowerCase().includes(q)) ||
      (e.sender_name && e.sender_name.toLowerCase().includes(q)) ||
      (e.body_text && e.body_text.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors ${
      darkMode ? 'bg-[#121214] text-white' : 'bg-[#faf8f6] text-zinc-900'
    }`}>
      {/* Real-time Push Alert for Other Device Approval */}
      <DeviceApprovalPrompt />

      {/* Hero Landing Page View */}
      {viewMode === 'hero' ? (
        <HeroLegalPage
          initialSection={heroInitialSection}
          onBackToApp={() => setViewMode('app')}
          onOpenLogin={() => {
            setAuthMode('login');
            setIsAuthOpen(true);
          }}
          onOpenRegister={() => {
            setAuthMode('register');
            setIsAuthOpen(true);
          }}
          onOpenOAuthDev={() => setIsOAuthDevOpen(true)}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      ) : (
        /* Permanent Webmail View */
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Header */}
          <GmailHeader
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onOpenAccountSwitcher={() => setIsAccountSwitcherOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            user={user}
            activeEmail={activeEmail}
            isSyncing={isSyncing}
            onSyncEmails={handleSyncEmails}
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
            onOpenOAuthDev={() => setIsOAuthDevOpen(true)}
          />

          {/* Mail List & Inbox */}
          <main className="flex-1 flex flex-col min-h-0">
            <EmailListView
              currentFolder={currentFolder}
              emails={filteredEmails}
              drafts={drafts}
              activeEmail={activeEmail}
              isLoading={isLoadingEmails}
              isRefreshing={isSyncing}
              onRefresh={handleSyncEmails}
              onSelectEmail={(m) => setSelectedEmail(m)}
              onSelectDraft={handleSelectDraft}
              onDeleteDraft={handleDeleteDraft}
              onToggleStar={handleToggleStar}
              onOpenCompose={handleOpenCompose}
              isCopied={isCopied}
              onCopyEmail={handleCopyEmail}
              darkMode={darkMode}
            />
          </main>

          {/* Drawer Sidebar */}
          <GmailDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            currentFolder={currentFolder}
            onSelectFolder={(folder) => setCurrentFolder(folder)}
            unreadCounts={unreadCounts}
            user={user}
            onOpenCompose={handleOpenCompose}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenHelp={() => alert('For support, email us at team@goldmailer.xyz or visit goldmailer.xyz/help.')}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onOpenHeroPage={(section) => {
              setViewMode('hero');
              if (section) setHeroInitialSection(section);
            }}
            onOpenOAuthDev={() => setIsOAuthDevOpen(true)}
            darkMode={darkMode}
          />
        </div>
      )}

      {/* Compose Email Modal (with auto-save draft every 3s) */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false);
          loadMailData(true);
        }}
        activeEmail={activeEmail}
        onEmailSent={() => loadMailData(false)}
        initialDraft={activeDraft}
        initialTo={composeInitialTo}
        initialSubject={composeInitialSubject}
        initialBody={composeInitialBody}
      />

      {/* Email Detail Reading Modal */}
      {selectedEmail && (
        <EmailDetailModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onDelete={handleDeleteEmail}
          onMoveToTrash={handleMoveToTrash}
          onMoveToSpam={handleMoveToSpam}
          onToggleStar={(id, starred) => handleToggleStar(id, starred, { stopPropagation: () => {} } as any)}
          onReply={handleReply}
          onForward={handleForward}
          darkMode={darkMode}
        />
      )}

      {/* Account Creation Flow & Login Wizard */}
      <AuthWizardModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authMode}
        onSuspiciousLoginDetected={handleSuspiciousLoginDetected}
      />

      {/* Suspicious Login Modal (Screen detected new device) */}
      <SuspiciousLoginModal
        isOpen={isSuspiciousModalOpen}
        onClose={() => setIsSuspiciousModalOpen(false)}
        data={suspiciousLoginData}
        onLoginApproved={(approvedUser) => {
          setIsSuspiciousModalOpen(false);
          handleAuthSuccess(approvedUser);
        }}
      />

      {/* OAuth 2.0 Consent Screen Modal */}
      <OAuthConsentModal
        isOpen={isOAuthConsentOpen}
        onClose={() => setIsOAuthConsentOpen(false)}
        clientId={oauthParams.clientId}
        redirectUri={oauthParams.redirectUri}
        scope={oauthParams.scope}
        state={oauthParams.state}
        user={user}
      />

      {/* OAuth 2.0 Developer Portal Modal */}
      <OAuthDeveloperModal
        isOpen={isOAuthDevOpen}
        onClose={() => setIsOAuthDevOpen(false)}
        activeEmail={activeEmail}
      />

      {/* Account Switcher Sheet */}
      <AccountSwitcherSheet
        isOpen={isAccountSwitcherOpen}
        onClose={() => setIsAccountSwitcherOpen(false)}
        activeEmail={activeEmail}
        user={user}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOAuthDev={() => setIsOAuthDevOpen(true)}
        onOpenHeroPage={(section) => {
          setViewMode('hero');
          setHeroInitialSection(section);
        }}
        onOpenAuth={(mode) => {
          setAuthMode(mode || 'login');
          setIsAuthOpen(true);
        }}
        onLogout={handleLogout}
        darkMode={darkMode}
      />

      {/* Settings Modal (2FA & Devices) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeEmail={activeEmail}
        user={user}
        onUserUpdated={(u) => {
          setUser(u);
          setStoredUser(u);
        }}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Admin Panel Modal */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />
    </div>
  );
}
