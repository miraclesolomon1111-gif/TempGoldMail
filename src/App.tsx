import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MailFolder, TempEmail, EmailMessage, UserProfile } from './types';
import {
  getStoredActiveEmail,
  setStoredActiveEmail,
  fetchTempEmails,
  createTempEmail,
  unlockTempEmail,
  deleteTempEmail,
  updateEmailPicture,
  fetchEmails,
  sendEmail,
  updateEmailStatus,
  deleteEmail,
  cleanUpSpace,
  fetchCurrentUser,
  clearAuthToken,
  setStoredUser,
  getLocalAddresses,
  saveLocalAddresses,
  addLocalAddress
} from './lib/api';
import { generateRandomEmail } from './lib/emailGenerator';
import { GmailHeader } from './components/GmailHeader';
import { GmailDrawer } from './components/GmailDrawer';
import { AccountSwitcherSheet } from './components/AccountSwitcherSheet';
import { EmailListView } from './components/EmailListView';
import { EmailDetailModal } from './components/EmailDetailModal';
import { ComposeModal } from './components/ComposeModal';
import { CustomEmailModal } from './components/CustomEmailModal';
import { PasswordUnlockModal } from './components/PasswordUnlockModal';
import { NowPaymentsModal } from './components/NowPaymentsModal';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { SupportModal } from './components/SupportModal';
import { SettingsModal } from './components/SettingsModal';
import { PrivacyModal, TermsModal } from './components/LegalModals';
import { HeroLegalPage } from './components/HeroLegalPage';

export default function App() {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'app' | 'hero'>('app');
  const [heroInitialSection, setHeroInitialSection] = useState<'hero' | 'terms' | 'privacy'>('hero');

  // Navigation & Folder state
  const [currentFolder, setCurrentFolder] = useState<MailFolder | 'all_inboxes'>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);

  // Email and Mailbox state - seamlessly loads and retains all created custom emails
  const [activeEmail, setActiveEmail] = useState<string>(() => getStoredActiveEmail());
  const [createdEmails, setCreatedEmails] = useState<TempEmail[]>(() => {
    const list = getLocalAddresses();
    const storedActive = getStoredActiveEmail();
    if (storedActive && !list.some(e => e.email_address.toLowerCase() === storedActive.toLowerCase())) {
      const initialRecord: TempEmail = {
        id: 'addr_' + Math.random().toString(36).substring(2, 9),
        email_address: storedActive,
        created_at: new Date().toISOString(),
        is_custom: true,
        message_count: 0
      };
      list.unshift(initialRecord);
      saveLocalAddresses(list);
    }
    return list;
  });
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // User state
  const [user, setUser] = useState<UserProfile | null>(null);

  // Modal open states
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialTo, setComposeInitialTo] = useState('');
  const [composeInitialSubject, setComposeInitialSubject] = useState('');
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockTargetEmail, setUnlockTargetEmail] = useState('');
  const [isNowPaymentsOpen, setIsNowPaymentsOpen] = useState(false);
  const [reserveTargetEmail, setReserveTargetEmail] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Check URL path and hash for direct routes
  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      if (path === '/admin' || hash === '#admin') {
        setIsAdminOpen(true);
      } else if (hash === '#hero' || hash === '#about' || path === '/hero') {
        setViewMode('hero');
        setHeroInitialSection('hero');
      } else if (hash === '#terms' || path === '/terms') {
        setViewMode('hero');
        setHeroInitialSection('terms');
      } else if (hash === '#privacy' || path === '/privacy') {
        setViewMode('hero');
        setHeroInitialSection('privacy');
      }
    };
    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  // Initial authentication check
  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u) setUser(u);
      })
      .catch(() => {});
  }, []);

  // Load created email addresses for this browser / user preserving all custom emails
  const loadAddresses = useCallback(async () => {
    try {
      const serverList = await fetchTempEmails(user?.id);
      setCreatedEmails((prev) => {
        const localList = getLocalAddresses();
        const map = new Map<string, TempEmail>();
        // 1. Previous in memory
        for (const item of prev) {
          if (item?.email_address) map.set(item.email_address.toLowerCase(), item);
        }
        // 2. Local storage
        for (const item of localList) {
          if (item?.email_address) {
            const cur = map.get(item.email_address.toLowerCase());
            map.set(item.email_address.toLowerCase(), { ...cur, ...item });
          }
        }
        // 3. Server list
        for (const item of (serverList || [])) {
          if (item?.email_address) {
            const cur = map.get(item.email_address.toLowerCase());
            map.set(item.email_address.toLowerCase(), { ...cur, ...item });
          }
        }
        // 4. Ensure current active email is always in list
        if (activeEmail && !map.has(activeEmail.toLowerCase())) {
          map.set(activeEmail.toLowerCase(), {
            id: 'addr_' + Math.random().toString(36).substring(2, 9),
            email_address: activeEmail,
            created_at: new Date().toISOString(),
            is_custom: true,
            message_count: 0
          });
        }
        const merged = Array.from(map.values());
        saveLocalAddresses(merged);
        return merged;
      });

      // If active email is not set, pick first available
      if (serverList && serverList.length > 0 && !activeEmail) {
        setActiveEmail(serverList[0].email_address);
        setStoredActiveEmail(serverList[0].email_address);
      }
    } catch (e) {
      console.warn('Failed to load user addresses:', e);
    }
  }, [user?.id, activeEmail]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // AbortController ref to cancel in-flight email fetch on fast switching
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load emails for the active email address with race-condition cancellation
  useEffect(() => {
    if (!activeEmail) {
      setEmails([]);
      setIsLoadingEmails(false);
      return;
    }

    // Cancel previous fetch when switching email with AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Add loading state: isLoadingEmails = true when switching. Show skeleton loader
    setIsLoadingEmails(true);

    const folderParam = currentFolder === 'all_inboxes' ? 'all' : currentFolder;

    fetchEmails(activeEmail, folderParam, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          console.log(`[App Email Fetch] activeEmail: ${activeEmail}, folder: ${folderParam}, fetched count: ${data?.length || 0}`);
          setEmails(data || []);
          setIsLoadingEmails(false);
          setIsRefreshing(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        console.warn('Failed to fetch emails:', err);
        if (!controller.signal.aborted) {
          setIsLoadingEmails(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeEmail, currentFolder]);

  // Real-time polling every 4 seconds to ingest incoming webhooks immediately
  useEffect(() => {
    if (!activeEmail) return;
    const targetEmail = activeEmail;
    const folderParam = currentFolder === 'all_inboxes' ? 'all' : currentFolder;

    const interval = setInterval(() => {
      fetchEmails(targetEmail, folderParam)
        .then((data) => {
          if (activeEmail.toLowerCase() === targetEmail.toLowerCase()) {
            setEmails(data || []);
          }
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [activeEmail, currentFolder]);

  // Manual refresh trigger
  const handleManualRefresh = () => {
    if (!activeEmail) return;
    setIsRefreshing(true);
    setIsLoadingEmails(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const folderParam = currentFolder === 'all_inboxes' ? 'all' : currentFolder;
    fetchEmails(activeEmail, folderParam, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          console.log(`[Manual Refresh] activeEmail: ${activeEmail}, count: ${data?.length || 0}`);
          setEmails(data || []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingEmails(false);
          setIsRefreshing(false);
        }
      });

    loadAddresses();
  };

  // Copy active email to clipboard
  const handleCopyEmail = () => {
    if (!activeEmail) return;
    navigator.clipboard.writeText(activeEmail);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Quick generate random email
  const handleGenerateQuick = async () => {
    const random = generateRandomEmail();
    try {
      const created = await createTempEmail({
        emailAddress: random,
        isCustom: false,
        userId: user?.id
      });
      setCreatedEmails((prev) => {
        const map = new Map<string, TempEmail>();
        for (const item of prev) {
          if (item?.email_address) map.set(item.email_address.toLowerCase(), item);
        }
        if (activeEmail && !map.has(activeEmail.toLowerCase())) {
          map.set(activeEmail.toLowerCase(), {
            id: 'addr_' + Math.random().toString(36).substring(2, 9),
            email_address: activeEmail,
            created_at: new Date().toISOString(),
            is_custom: false,
            message_count: 0
          });
        }
        map.set(created.email_address.toLowerCase(), created);
        const updated = Array.from(map.values());
        saveLocalAddresses(updated);
        return updated;
      });
      setActiveEmail(created.email_address);
      setStoredActiveEmail(created.email_address);
      await loadAddresses();
    } catch (err: any) {
      console.warn('Generate address fallback:', err);
      const fallbackRecord: TempEmail = {
        id: 'addr_' + Math.random().toString(36).substring(2, 9),
        email_address: random,
        created_at: new Date().toISOString(),
        is_custom: false,
        message_count: 0
      };
      setCreatedEmails((prev) => {
        const map = new Map<string, TempEmail>();
        for (const item of prev) {
          if (item?.email_address) map.set(item.email_address.toLowerCase(), item);
        }
        if (activeEmail && !map.has(activeEmail.toLowerCase())) {
          map.set(activeEmail.toLowerCase(), {
            id: 'addr_' + Math.random().toString(36).substring(2, 9),
            email_address: activeEmail,
            created_at: new Date().toISOString(),
            is_custom: false,
            message_count: 0
          });
        }
        map.set(fallbackRecord.email_address.toLowerCase(), fallbackRecord);
        const updated = Array.from(map.values());
        saveLocalAddresses(updated);
        return updated;
      });
      setActiveEmail(random);
      setStoredActiveEmail(random);
      await loadAddresses();
    }
  };

  // Switch to another email address with password check & clean loading transition
  const handleSelectEmail = async (emailAddr: string) => {
    const cleanAddr = emailAddr.trim().toLowerCase();
    if (cleanAddr === activeEmail.toLowerCase()) return;

    const target = createdEmails.find(
      (e) => e.email_address.toLowerCase() === cleanAddr
    );

    if (target?.is_password_protected) {
      setUnlockTargetEmail(cleanAddr);
      setIsUnlockModalOpen(true);
      return;
    }

    // Cancel in-flight fetch immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Set loading state true when switching to avoid glitching
    setIsLoadingEmails(true);
    setEmails([]); // Don't show old emails while switching

    setActiveEmail(cleanAddr);
    setStoredActiveEmail(cleanAddr);
  };

  // Unlock password-protected mailbox
  const handleUnlockMailbox = async (password: string) => {
    const unlocked = await unlockTempEmail(unlockTargetEmail, password);
    setActiveEmail(unlocked.email_address);
    setStoredActiveEmail(unlocked.email_address);
  };

  // Create custom email (preserves all previous custom emails so user can switch between them)
  const handleCreateCustom = async (data: {
    emailAddress: string;
    isCustom: boolean;
    password?: string;
    avatarUrl?: string;
    isReserved?: boolean;
  }) => {
    const created = await createTempEmail({
      ...data,
      userId: user?.id
    });
    // Add new email to createdEmails list and PRESERVE all previous custom emails
    setCreatedEmails((prev) => {
      const map = new Map<string, TempEmail>();
      for (const item of prev) {
        if (item?.email_address) map.set(item.email_address.toLowerCase(), item);
      }
      if (activeEmail && !map.has(activeEmail.toLowerCase())) {
        map.set(activeEmail.toLowerCase(), {
          id: 'addr_' + Math.random().toString(36).substring(2, 9),
          email_address: activeEmail,
          created_at: new Date().toISOString(),
          is_custom: true,
          message_count: 0
        });
      }
      map.set(created.email_address.toLowerCase(), created);
      const updated = Array.from(map.values());
      saveLocalAddresses(updated);
      return updated;
    });
    setActiveEmail(created.email_address);
    setStoredActiveEmail(created.email_address);
    await loadAddresses();
  };

  // Delete custom email address
  const handleDeleteCustomEmail = async (id: string, emailAddr: string) => {
    await deleteTempEmail(id || emailAddr);
    setCreatedEmails((prev) =>
      prev.filter((e) => e.email_address.toLowerCase() !== emailAddr.toLowerCase())
    );
    if (activeEmail.toLowerCase() === emailAddr.toLowerCase()) {
      const remaining = createdEmails.filter(
        (e) => e.email_address.toLowerCase() !== emailAddr.toLowerCase()
      );
      const nextEmail = remaining[0]?.email_address || '';
      setActiveEmail(nextEmail);
      setStoredActiveEmail(nextEmail);
    }
    await loadAddresses();
  };

  // Send Email (with slow reply / scheduled send)
  const handleSendEmail = async (data: {
    from: string;
    to: string;
    subject: string;
    text: string;
    scheduledFor?: string;
  }) => {
    await sendEmail({
      from: data.from || activeEmail,
      to: data.to,
      subject: data.subject,
      text: data.text,
      scheduledFor: data.scheduledFor
    });
    if (activeEmail) {
      const folderParam = currentFolder === 'all_inboxes' ? 'all' : currentFolder;
      const refreshed = await fetchEmails(activeEmail, folderParam);
      setEmails(refreshed);
    }
  };

  // Star / Unstar
  const handleToggleStar = async (emailId: string, currentStarred: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEmails((prev) =>
      prev.map((m) => (m.id === emailId ? { ...m, is_starred: !currentStarred } : m))
    );
    try {
      await updateEmailStatus(emailId, { is_starred: !currentStarred });
    } catch {}
  };

  // Move to Trash
  const handleMoveToTrash = async (emailId: string) => {
    setEmails((prev) => prev.filter((m) => m.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    try {
      await updateEmailStatus(emailId, { folder: 'trash' });
    } catch {}
  };

  // Move to Spam
  const handleMoveToSpam = async (emailId: string) => {
    setEmails((prev) => prev.filter((m) => m.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    try {
      await updateEmailStatus(emailId, { folder: 'spam' });
    } catch {}
  };

  // Reply
  const handleReply = (to: string, subject: string) => {
    setComposeInitialTo(to);
    setComposeInitialSubject(subject.startsWith('Re:') ? subject : `Re: ${subject}`);
    setIsComposeOpen(true);
  };

  // Forward
  const handleForward = (email: EmailMessage) => {
    setComposeInitialTo('');
    setComposeInitialSubject(`Fwd: ${email.subject}`);
    setIsComposeOpen(true);
  };

  // Cleanup Storage (deletes trash & spam)
  const handleCleanStorage = async () => {
    const res = await cleanUpSpace();
    alert(res.message);
    if (activeEmail) {
      const folderParam = currentFolder === 'all_inboxes' ? 'all' : currentFolder;
      const refreshed = await fetchEmails(activeEmail, folderParam);
      setEmails(refreshed);
    }
  };

  // Profile Avatar update
  const handleUpdateAvatar = async (base64OrUrl: string) => {
    if (user) {
      setUser({ ...user, avatar_url: base64OrUrl });
      setStoredUser({ ...user, avatar_url: base64OrUrl });
    }
    if (activeEmail) {
      try {
        await updateEmailPicture(activeEmail, base64OrUrl);
        await loadAddresses();
      } catch {}
    }
  };

  // Logout
  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
    loadAddresses();
  };

  // Calculate real unread counts per folder
  const unreadCounts: Record<string, number> = {
    total: emails.filter((e) => !e.is_read && e.folder !== 'trash').length,
    primary: emails.filter((e) => !e.is_read && (!e.folder || e.folder === 'primary')).length,
    promotions: emails.filter((e) => !e.is_read && e.category === 'promotions').length,
    social: emails.filter((e) => !e.is_read && e.category === 'social').length,
    updates: emails.filter((e) => !e.is_read && e.category === 'updates').length,
    sent: emails.filter((e) => e.folder === 'sent').length,
    scheduled: emails.filter((e) => e.folder === 'scheduled').length,
    outbox: 0,
    drafts: 0,
    all_mail: emails.length,
    spam: emails.filter((e) => e.folder === 'spam').length,
    trash: emails.filter((e) => e.folder === 'trash').length
  };

  // Filter emails by search query in real time
  const filteredEmails = emails.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      m.subject?.toLowerCase().includes(q) ||
      m.sender?.toLowerCase().includes(q) ||
      m.sender_name?.toLowerCase().includes(q) ||
      m.body_text?.toLowerCase().includes(q)
    );
  });

  // If user navigated to Hero / Landing Page view
  if (viewMode === 'hero') {
    return (
      <HeroLegalPage
        onBackToApp={() => {
          setViewMode('app');
          if (window.location.hash) {
            window.history.pushState(null, '', window.location.pathname);
          }
        }}
        initialSection={heroInitialSection}
        activeEmail={activeEmail || 'anything@goldmailer.xyz'}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#e3e3e3] flex flex-col font-sans select-none antialiased">
      {/* Top Gmail Search Header (Screenshot 3) */}
      <GmailHeader
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenAccountSwitcher={() => setIsAccountSwitcherOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        user={user}
        activeEmail={activeEmail}
      />

      {/* Main Mail View (Category header, email list, Compose FAB, Bottom Nav) */}
      <EmailListView
        currentFolder={currentFolder}
        emails={filteredEmails}
        activeEmail={activeEmail}
        isLoading={isLoadingEmails}
        isRefreshing={isRefreshing}
        onRefresh={handleManualRefresh}
        onSelectEmail={(msg) => {
          setSelectedEmail(msg);
          // Mark as read immediately
          if (!msg.is_read) {
            updateEmailStatus(msg.id, { is_read: true });
            setEmails((prev) =>
              prev.map((e) => (e.id === msg.id ? { ...e, is_read: true } : e))
            );
          }
        }}
        onToggleStar={handleToggleStar}
        onOpenCompose={() => {
          setComposeInitialTo('');
          setComposeInitialSubject('');
          setIsComposeOpen(true);
        }}
        onOpenCreateModal={() => setIsCustomModalOpen(true)}
        onGenerateQuick={handleGenerateQuick}
        isCopied={isCopied}
        onCopyEmail={handleCopyEmail}
        totalUnreadCount={unreadCounts.total}
      />

      {/* Navigation Drawer (Screenshots 1 & 2) */}
      <GmailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        currentFolder={currentFolder}
        onSelectFolder={(f) => setCurrentFolder(f)}
        unreadCounts={unreadCounts}
        user={user}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsSupportOpen(true)}
        onOpenCreateLabel={() => setIsCustomModalOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenHeroPage={(section) => {
          setHeroInitialSection(section || 'hero');
          setViewMode('hero');
        }}
      />

      {/* Account Switcher Bottom Sheet / Dialog (Screenshots 4 & 5) */}
      <AccountSwitcherSheet
        isOpen={isAccountSwitcherOpen}
        onClose={() => setIsAccountSwitcherOpen(false)}
        activeEmail={activeEmail}
        createdEmails={createdEmails}
        user={user}
        onSelectEmail={handleSelectEmail}
        onOpenAddAccount={() => setIsCustomModalOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenPremium={() => {
          setReserveTargetEmail(activeEmail || 'custom@goldmailer.xyz');
          setIsNowPaymentsOpen(true);
        }}
        onDeleteCustomEmail={handleDeleteCustomEmail}
        onCleanStorage={handleCleanStorage}
        onUpdateAvatar={handleUpdateAvatar}
        onOpenPrivacy={() => {
          setHeroInitialSection('privacy');
          setViewMode('hero');
        }}
        onOpenTerms={() => {
          setHeroInitialSection('terms');
          setViewMode('hero');
        }}
        onOpenHeroPage={(section) => {
          setHeroInitialSection(section || 'hero');
          setViewMode('hero');
        }}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* Email Detail Reading View (with clickable links) */}
      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
        onDelete={(id) => {
          deleteEmail(id);
          setEmails((prev) => prev.filter((m) => m.id !== id));
          setSelectedEmail(null);
        }}
        onMoveToTrash={handleMoveToTrash}
        onMoveToSpam={handleMoveToSpam}
        onToggleStar={(id, starred) => {
          handleToggleStar(id, !starred);
          if (selectedEmail) {
            setSelectedEmail({ ...selectedEmail, is_starred: starred });
          }
        }}
        onReply={handleReply}
        onForward={handleForward}
      />

      {/* Compose Email Modal (Slow Reply / Scheduled Send) */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        availableFromEmails={createdEmails}
        activeEmail={activeEmail}
        onSend={handleSendEmail}
        initialTo={composeInitialTo}
        initialSubject={composeInitialSubject}
      />

      {/* Custom & Multi Email Management Modal */}
      <CustomEmailModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        user={user}
        onCreate={handleCreateCustom}
        onOpenReservePayment={(emailAddr) => {
          setReserveTargetEmail(emailAddr);
          setIsNowPaymentsOpen(true);
        }}
      />

      {/* Password Unlock Modal for Protected Mailboxes */}
      <PasswordUnlockModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        emailAddress={unlockTargetEmail}
        onUnlock={handleUnlockMailbox}
      />

      {/* NOWPayments Modal ($1.11 / Year Reserve Email Forever) */}
      <NowPaymentsModal
        isOpen={isNowPaymentsOpen}
        onClose={() => setIsNowPaymentsOpen(false)}
        targetEmail={reserveTargetEmail}
        userId={user?.id}
        onSuccess={() => {
          loadAddresses();
          if (user) {
            setUser({ ...user, isPremium: true });
          }
        }}
      />

      {/* Auth Modal (Login / Sign Up with Profile & 250 Countries) */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => {
          setUser(u);
          loadAddresses();
        }}
      />

      {/* User Profile & Account Settings Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        createdEmails={createdEmails}
        onUpdateUser={(updated) => setUser(updated)}
        onDeleteEmail={handleDeleteCustomEmail}
        onOpenReserve={(emailAddr) => {
          setReserveTargetEmail(emailAddr);
          setIsNowPaymentsOpen(true);
        }}
      />

      {/* Admin Panel Modal (/admin) */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          if (window.location.pathname === '/admin') {
            window.history.pushState(null, '', '/');
          }
        }}
      />

      {/* Help & Feedback / Support Chat Modal */}
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        userEmail={user?.email || activeEmail}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeEmail={activeEmail}
      />

      {/* Privacy & Terms Modals */}
      <PrivacyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
}
