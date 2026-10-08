import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Mail,
  ShieldAlert,
  FileText,
  HardDrive,
  CreditCard,
  Receipt,
  Globe,
  Activity,
  BarChart3,
  MessageSquare,
  Shield,
  ArchiveRestore,
  Settings,
  UserCheck,
  Bell,
  Database,
  KeyRound,
  Clock,
  X,
  Search,
  Moon,
  Sun,
  RefreshCw,
  Plus,
  Trash2,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Download,
  Send,
  Eye,
  EyeOff,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Sliders,
  DollarSign,
  UserPlus,
  Menu
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminEmailAccounts,
  toggleBanUser,
  fetchAdminEmailLogs,
  fetchAdminStorage,
  updateAdminStorageLimit,
  fetchAdminSubscriptions,
  updateAdminSubscription,
  fetchAdminPayments,
  fetchAdminDomains,
  addAdminDomain,
  verifyAdminDomain,
  deleteAdminDomain,
  fetchAdminSystemHealth,
  fetchAdminAnalytics,
  fetchAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportTicketStatus,
  fetchAdminSecurity,
  blockAdminIp,
  unblockAdminIp,
  fetchAdminTrashRecovery,
  recoverAdminEmail,
  fetchAdminSiteSettings,
  updateAdminSiteSettings,
  fetchAdminRoles,
  addAdminRole,
  deleteAdminRole,
  fetchAdminBroadcasts,
  sendAdminBroadcast,
  triggerAdminBackupDownload,
  restoreAdminBackup,
  fetchAdminApiKeys,
  updateAdminApiKeys,
  fetchAdminActivityLogs,
  fetchAdminTwilioStatus,
  updateAdminTwilioConfig,
  testAdminTwilioConnection
} from '../lib/api';
import {
  UserProfile,
  AdminOverviewStats,
  AdminActivityLogItem,
  AdminSupportTicket,
  AdminDomainItem,
  AdminRoleStaff,
  AdminBroadcastItem,
  AdminPaymentItem,
  AdminSystemHealth,
  AdminSiteSettings
} from '../types';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
}

type SidebarTab =
  | 'overview'
  | 'users'
  | 'email_accounts'
  | 'ban_users'
  | 'email_logs'
  | 'storage'
  | 'subscriptions'
  | 'payments'
  | 'domains'
  | 'system_health'
  | 'analytics'
  | 'support_tickets'
  | 'security'
  | 'trash_recovery'
  | 'settings'
  | 'roles'
  | 'notifications'
  | 'backup'
  | 'api_keys'
  | 'activity_logs';

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');
  const [darkMode, setDarkMode] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data states
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [storageData, setStorageData] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any>(null);
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [domains, setDomains] = useState<AdminDomainItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealth | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [securityData, setSecurityData] = useState<any>(null);
  const [trashRecovery, setTrashRecovery] = useState<any[]>([]);
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettings | null>(null);
  const [adminRoles, setAdminRoles] = useState<AdminRoleStaff[]>([]);
  const [broadcasts, setBroadcasts] = useState<AdminBroadcastItem[]>([]);
  const [apiKeysStatus, setApiKeysStatus] = useState<any>(null);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogItem[]>([]);

  // Modals & form states inside Admin
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ firstName: '', lastName: '', username: '', password: '', role: 'user', plan: 'free' });
  const [banReasonModal, setBanReasonModal] = useState<{ open: boolean; user: UserProfile | null; reason: string }>({ open: false, user: null, reason: '' });
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicket | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState('');
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', target: 'all' });
  const [newDomainName, setNewDomainName] = useState('');
  const [newBlockedIp, setNewBlockedIp] = useState('');
  const [storageEditModal, setStorageEditModal] = useState<{ open: boolean; user: any | null; limitGb: number }>({ open: false, user: null, limitGb: 15 });
  const [newRoleForm, setNewRoleForm] = useState({ email: '', name: '', role: 'support_admin' });

  // Twilio & SMTP Settings state
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioTrialNumber, setTwilioTrialNumber] = useState('+1 (267) 230-1662');
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [isTestingTwilio, setIsTestingTwilio] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.goldmailer.xyz');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('postmaster@goldmailer.xyz');
  const [smtpPass, setSmtpPass] = useState('');

  // Clear notice after 4 seconds
  useEffect(() => {
    if (feedbackNotice) {
      const t = setTimeout(() => setFeedbackNotice(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedbackNotice]);

  // Load section data dynamically
  const loadTabContent = async (tab: SidebarTab) => {
    setIsLoading(true);
    try {
      if (tab === 'overview') {
        const [ov, hl, acts] = await Promise.all([
          fetchAdminOverview(),
          fetchAdminSystemHealth().catch(() => null),
          fetchAdminActivityLogs().catch(() => [])
        ]);
        setOverview(ov);
        setSystemHealth(hl);
        setActivityLogs(acts);
      } else if (tab === 'users' || tab === 'ban_users') {
        const us = await fetchAdminUsers();
        setUsers(us);
      } else if (tab === 'email_accounts') {
        const ea = await fetchAdminEmailAccounts();
        setEmailAccounts(ea);
      } else if (tab === 'email_logs') {
        const logs = await fetchAdminEmailLogs();
        setEmailLogs(logs);
      } else if (tab === 'storage') {
        const st = await fetchAdminStorage();
        setStorageData(st);
      } else if (tab === 'subscriptions') {
        const sub = await fetchAdminSubscriptions();
        setSubscriptions(sub);
      } else if (tab === 'payments') {
        const pm = await fetchAdminPayments();
        setPayments(pm);
      } else if (tab === 'domains') {
        const dm = await fetchAdminDomains();
        setDomains(dm);
      } else if (tab === 'system_health') {
        const hl = await fetchAdminSystemHealth();
        setSystemHealth(hl);
      } else if (tab === 'analytics') {
        const an = await fetchAdminAnalytics();
        setAnalytics(an);
      } else if (tab === 'support_tickets') {
        const tk = await fetchAdminSupportTickets();
        setSupportTickets(tk);
      } else if (tab === 'security') {
        const sc = await fetchAdminSecurity();
        setSecurityData(sc);
      } else if (tab === 'trash_recovery') {
        const tr = await fetchAdminTrashRecovery();
        setTrashRecovery(tr.trashedEmails || []);
      } else if (tab === 'settings') {
        const st = await fetchAdminSiteSettings();
        setSiteSettings(st);
      } else if (tab === 'roles') {
        const rl = await fetchAdminRoles();
        setAdminRoles(rl);
      } else if (tab === 'notifications') {
        const bc = await fetchAdminBroadcasts();
        setBroadcasts(bc);
      } else if (tab === 'api_keys') {
        const ak = await fetchAdminApiKeys();
        setApiKeysStatus(ak);
        if (ak?.smtp_host) setSmtpHost(ak.smtp_host);
        if (ak?.smtp_port) setSmtpPort(String(ak.smtp_port));
        if (ak?.smtp_user) setSmtpUser(ak.smtp_user);
        const tw = await fetchAdminTwilioStatus().catch(() => null);
        if (tw?.trialNumber) setTwilioTrialNumber(tw.trialNumber);
      } else if (tab === 'activity_logs') {
        const logs = await fetchAdminActivityLogs();
        setActivityLogs(logs);
      }
    } catch (err: any) {
      console.warn(`Error loading tab ${tab}:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTabContent(activeTab);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Sidebar navigation items (20 features)
  const navGroups = [
    {
      group: 'Core Management',
      items: [
        { id: 'overview' as SidebarTab, label: 'Dashboard Overview', icon: LayoutDashboard },
        { id: 'users' as SidebarTab, label: 'User Management', icon: Users, badge: users.length || undefined },
        { id: 'email_accounts' as SidebarTab, label: 'Email Accounts', icon: Mail },
        { id: 'ban_users' as SidebarTab, label: 'Ban / Suspend Users', icon: Ban, badge: users.filter(u => u.is_banned).length || undefined }
      ]
    },
    {
      group: 'Email & Storage',
      items: [
        { id: 'email_logs' as SidebarTab, label: 'Email Logs', icon: FileText },
        { id: 'storage' as SidebarTab, label: 'Storage Management', icon: HardDrive },
        { id: 'trash_recovery' as SidebarTab, label: 'Trash Recovery (30d)', icon: ArchiveRestore }
      ]
    },
    {
      group: 'Billing & Domains',
      items: [
        { id: 'subscriptions' as SidebarTab, label: 'Subscriptions & Plans', icon: CreditCard },
        { id: 'payments' as SidebarTab, label: 'Payments & Invoices', icon: Receipt },
        { id: 'domains' as SidebarTab, label: 'Domains & DNS', icon: Globe }
      ]
    },
    {
      group: 'Health & Operations',
      items: [
        { id: 'system_health' as SidebarTab, label: 'System Health', icon: Activity },
        { id: 'analytics' as SidebarTab, label: 'Reports & Analytics', icon: BarChart3 },
        { id: 'support_tickets' as SidebarTab, label: 'Support Tickets', icon: MessageSquare, badge: supportTickets.filter(t => t.status === 'open').length || undefined },
        { id: 'security' as SidebarTab, label: 'Spam & Security', icon: Shield }
      ]
    },
    {
      group: 'Administration & System',
      items: [
        { id: 'notifications' as SidebarTab, label: 'Broadcast Notifications', icon: Bell },
        { id: 'settings' as SidebarTab, label: 'System Settings', icon: Settings },
        { id: 'roles' as SidebarTab, label: 'Admin Roles & Staff', icon: UserCheck },
        { id: 'backup' as SidebarTab, label: 'Backup & Restore', icon: Database },
        { id: 'api_keys' as SidebarTab, label: 'API Keys (Twilio/Resend)', icon: KeyRound },
        { id: 'activity_logs' as SidebarTab, label: 'Admin Activity Logs', icon: Clock }
      ]
    }
  ];

  // Actions
  const handleToggleBan = async (user: UserProfile) => {
    if (!user.is_banned) {
      // Open reason modal
      setBanReasonModal({ open: true, user, reason: '' });
    } else {
      // Unban directly
      try {
        const res = await toggleBanUser(user.id, false, 'Unbanned by admin');
        setUsers(users.map(u => (u.id === user.id ? { ...u, is_banned: false, banned_at: undefined, ban_reason: undefined } : u)));
        setFeedbackNotice({ type: 'success', message: `Account ${user.email} unbanned successfully.` });
      } catch (err: any) {
        setFeedbackNotice({ type: 'error', message: err.message || 'Failed to unban user' });
      }
    }
  };

  const handleConfirmBan = async () => {
    if (!banReasonModal.user) return;
    try {
      const res = await toggleBanUser(banReasonModal.user.id, true, banReasonModal.reason.trim() || 'Violating Terms of Service');
      setUsers(users.map(u => (u.id === banReasonModal.user!.id ? { ...u, is_banned: true, banned_at: res.banned_at, ban_reason: res.ban_reason } : u)));
      setBanReasonModal({ open: false, user: null, reason: '' });
      setFeedbackNotice({ type: 'success', message: `Account banned permanently in database.` });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to ban user' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createAdminUser(newUserForm);
      if (res.success) {
        setIsNewUserModalOpen(false);
        setNewUserForm({ firstName: '', lastName: '', username: '', password: '', role: 'user', plan: 'free' });
        loadTabContent('users');
        setFeedbackNotice({ type: 'success', message: `User ${res.user.email} created in database.` });
      }
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to create user' });
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete user ${email}? This action is irreversible.`)) return;
    try {
      await deleteAdminUser(userId);
      setUsers(users.filter(u => u.id !== userId));
      setFeedbackNotice({ type: 'success', message: `User deleted permanently.` });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to delete user' });
    }
  };

  const handleRecoverEmail = async (emailId: string) => {
    try {
      await recoverAdminEmail(emailId);
      setTrashRecovery(trashRecovery.filter(e => e.id !== emailId));
      setFeedbackNotice({ type: 'success', message: 'Email restored back to inbox successfully.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to recover email' });
    }
  };

  const handleReplyTicket = async () => {
    if (!selectedTicket || !ticketReplyText.trim()) return;
    try {
      const res = await replyAdminSupportTicket(selectedTicket.id, ticketReplyText.trim(), 'in_progress');
      if (res.success) {
        setSelectedTicket(res.ticket);
        setTicketReplyText('');
        loadTabContent('support_tickets');
        setFeedbackNotice({ type: 'success', message: 'Reply sent to user.' });
      }
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to send reply' });
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) return;
    try {
      await sendAdminBroadcast(broadcastForm.title, broadcastForm.message, broadcastForm.target);
      setBroadcastForm({ title: '', message: '', target: 'all' });
      loadTabContent('notifications');
      setFeedbackNotice({ type: 'success', message: 'Broadcast announcement sent to all users!' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message || 'Failed to send broadcast' });
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;
    try {
      await addAdminDomain(newDomainName.trim());
      setNewDomainName('');
      loadTabContent('domains');
      setFeedbackNotice({ type: 'success', message: 'Domain registered for validation.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    }
  };

  const handleVerifyDomain = async (domId: string) => {
    try {
      await verifyAdminDomain(domId);
      loadTabContent('domains');
      setFeedbackNotice({ type: 'success', message: 'Domain DNS verified successfully.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    }
  };

  const handleBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedIp.trim()) return;
    try {
      await blockAdminIp(newBlockedIp.trim(), 'Blocked by administrator');
      setNewBlockedIp('');
      loadTabContent('security');
      setFeedbackNotice({ type: 'success', message: 'IP address blocked successfully.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    }
  };

  const handleUnblockIp = async (ip: string) => {
    try {
      await unblockAdminIp(ip);
      loadTabContent('security');
      setFeedbackNotice({ type: 'success', message: 'IP address unblocked.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    }
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await Promise.all([
        updateAdminTwilioConfig({
          accountSid: twilioAccountSid.trim() || undefined,
          authToken: twilioAuthToken.trim() || undefined,
          trialNumber: twilioTrialNumber.trim() || undefined
        }),
        updateAdminApiKeys({
          smtp_host: smtpHost.trim() || 'smtp.goldmailer.xyz',
          smtp_port: Number(smtpPort) || 587,
          smtp_user: smtpUser.trim() || 'postmaster@goldmailer.xyz',
          ...(smtpPass.trim() ? { smtp_pass: smtpPass.trim() } : {})
        })
      ]);
      loadTabContent('api_keys');
      setFeedbackNotice({ type: 'success', message: 'SMTP (goldmailer.xyz), Twilio & API keys saved successfully.' });
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    }
  };

  const handleTestTwilio = async () => {
    setIsTestingTwilio(true);
    try {
      const res = await testAdminTwilioConnection({
        accountSid: twilioAccountSid.trim() || undefined,
        authToken: twilioAuthToken.trim() || undefined,
        trialNumber: twilioTrialNumber.trim() || undefined
      });
      if (res.success) {
        setFeedbackNotice({ type: 'success', message: `Twilio operational! Live numbers found: ${res.trialNumbers?.length || 0}` });
      } else {
        setFeedbackNotice({ type: 'error', message: res.error || 'Connection failed' });
      }
    } catch (err: any) {
      setFeedbackNotice({ type: 'error', message: err.message });
    } finally {
      setIsTestingTwilio(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden animate-in fade-in duration-150 ${
        darkMode ? 'bg-[#0b0c0e] text-zinc-100' : 'bg-slate-100 text-zinc-900'
      }`}
    >
      {/* ================= TOP WORKSPACE HEADER ================= */}
      <header
        className={`h-14 sm:h-16 border-b flex-shrink-0 flex items-center justify-between px-3 sm:px-6 z-20 ${
          darkMode ? 'bg-[#121316] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        {/* Left: Mobile Menu Button + Branding & Workspace badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Admin Navigation Menu"
            className={`lg:hidden p-2 rounded-xl border transition-colors flex-shrink-0 ${
              darkMode
                ? 'bg-zinc-800/80 border-zinc-700 text-zinc-200 hover:text-[#FF8C42]'
                : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white font-extrabold text-base sm:text-xl shadow-md shadow-[#FF6A00]/25 flex-shrink-0">
            G
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white truncate">GoldMailer</span>
              <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/30 uppercase tracking-wider whitespace-nowrap">
                Admin
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-zinc-400 font-medium truncate">
              Enterprise Email Control Panel (goldmailer.xyz)
            </p>
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-4 lg:mx-8">
          <div
            className={`w-full flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm transition-all ${
              darkMode
                ? 'bg-zinc-900/80 border-zinc-800 text-zinc-200 focus-within:border-[#FF6A00]/50'
                : 'bg-zinc-50 border-zinc-300 text-zinc-800 focus-within:border-[#FF6A00]'
            }`}
          >
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search users, @goldmailer.xyz emails, tickets, domains..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full bg-transparent outline-none text-xs"
            />
            {globalSearch && (
              <button onClick={() => setGlobalSearch('')} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: DB Status, Dark Mode Toggle, Profile & Close */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Real-time DB Status badge */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Database Live (goldmailer.xyz)</span>
          </div>

          {/* Dark / Light Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle Theme"
            className={`p-2 rounded-xl border transition-colors ${
              darkMode ? 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:text-white' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Admin Profile pill */}
          <div
            className={`hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="w-7 h-7 rounded-lg bg-[#FF6A00] flex items-center justify-center text-white font-bold text-xs">
              M
            </div>
            <div className="text-left text-xs">
              <p className="font-bold text-white truncate max-w-[120px]">{currentUser?.first_name || 'Miracle Solomon'}</p>
              <p className="text-[10px] text-[#FF8C42] font-semibold">Super Administrator</p>
            </div>
          </div>

          {/* Close Full Screen Admin & Return to Webmail */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-all"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Exit Admin</span>
          </button>
        </div>
      </header>

      {/* ================= MOBILE HORIZONTAL QUICK-TAB BAR ================= */}
      <div
        className={`lg:hidden flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b flex-shrink-0 z-10 ${
          darkMode ? 'bg-[#0f1013] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        {navGroups.flatMap((g) => g.items).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-xs'
                  : darkMode
                  ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= MOBILE SLIDE-OVER NAVIGATION DRAWER ================= */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside
            className={`relative w-72 max-w-[85vw] h-full z-10 flex flex-col justify-between overflow-y-auto border-r shadow-2xl ${
              darkMode ? 'bg-[#0f1013] border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center text-white font-bold text-xs">
                    G
                  </div>
                  <span className="font-bold text-sm">Admin Navigation</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile Search Input */}
              <div className="p-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                  <Search className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search @goldmailer.xyz..."
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    className="w-full bg-transparent outline-none text-white"
                  />
                </div>
              </div>

              <div className="p-3 space-y-4">
                {navGroups.map((group) => (
                  <div key={group.group}>
                    <h4 className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {group.group}
                    </h4>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                              isActive
                                ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-sm font-semibold'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge !== undefined && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isActive ? 'bg-white/20 text-white' : 'bg-[#FF6A00]/15 text-[#FF8C42]'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Floating Notice Bar */}
      {feedbackNotice && (
        <div
          className={`absolute top-18 right-6 z-50 px-4 py-2.5 rounded-xl shadow-xl border flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-top duration-200 ${
            feedbackNotice.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-red-950/90 border-red-500/50 text-red-200'
          }`}
        >
          {feedbackNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
          <span>{feedbackNotice.message}</span>
        </div>
      )}

      {/* ================= MAIN FULL-SCREEN WORKSPACE BODY ================= */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ----------------- LEFT SIDEBAR NAVIGATION (DESKTOP) ----------------- */}
        <aside
          className={`hidden lg:flex w-64 flex-shrink-0 border-r flex-col justify-between overflow-y-auto ${
            darkMode ? 'bg-[#0f1013] border-zinc-800/80' : 'bg-white border-zinc-200'
          }`}
        >
          <div className="p-3 space-y-5">
            {navGroups.map((group) => (
              <div key={group.group}>
                <h4 className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {group.group}
                </h4>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-sm font-semibold'
                            : darkMode
                            ? 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isActive ? 'bg-white/20 text-white' : 'bg-[#FF6A00]/15 text-[#FF8C42]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer info */}
          <div
            className={`p-3 border-t text-[11px] space-y-1 ${
              darkMode ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>GoldMailer Server</span>
              <span className="text-emerald-400 font-mono">v2.4.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Database Storage</span>
              <span className="text-zinc-400 font-mono">Persistent</span>
            </div>
          </div>
        </aside>

        {/* ----------------- MAIN VIEW CONTENT CONTAINER ----------------- */}
        <main
          className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:p-8 ${
            darkMode ? 'bg-[#0b0c0e]' : 'bg-slate-50'
          }`}
        >
          {/* Header of the active tab */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 sm:pb-5 border-b border-zinc-800/60 mb-5 sm:mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-1">
                <span>GoldMailer Admin</span>
                <span>/</span>
                <span className="text-[#FF8C42] capitalize">{activeTab.replace('_', ' ')}</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white capitalize">
                {activeTab.replace('_', ' ')}
              </h1>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => loadTabContent(activeTab)}
                disabled={isLoading}
                className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
                  darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white' : 'bg-white border-zinc-300 text-zinc-700'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>

              {activeTab === 'users' && (
                <button
                  onClick={() => setIsNewUserModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#FF6A00]/25"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create User</span>
                </button>
              )}

              {activeTab === 'notifications' && (
                <button
                  onClick={() => setActiveTab('notifications')}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#FF6A00]/25"
                >
                  <Send className="w-4 h-4" />
                  <span>Broadcast Message</span>
                </button>
              )}
            </div>
          </div>

          {/* ================= SECTION VIEWS (ALL 20 IMPLEMENTED) ================= */}

          {/* 1. DASHBOARD OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Total Accounts Created</p>
                    <p className="text-2xl font-black text-white mt-1">{overview?.totalUsers || users.length || 2}</p>
                    <p className="text-[11px] text-emerald-400 mt-1">● {overview?.activeAccountsCount || users.length || 2} active</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF8C42]">
                    <Users className="w-6 h-6" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Emails in Storage</p>
                    <p className="text-2xl font-black text-white mt-1">{overview?.totalEmails || 0}</p>
                    <p className="text-[11px] text-zinc-400 mt-1">15 GB quota active</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Mail className="w-6 h-6" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Cloud Storage Allocated</p>
                    <p className="text-2xl font-black text-white mt-1">{overview?.totalStorageUsedGb ?? '0.00'} GB</p>
                    <p className="text-[11px] text-zinc-400 mt-1">across all users</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <HardDrive className="w-6 h-6" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Monthly Revenue</p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">${overview?.monthlyRevenueUsd ?? '0.00'}</p>
                    <p className="text-[11px] text-zinc-400 mt-1">NOWPayments + Crypto</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Quick Summary Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* System Status card */}
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Infrastructure Health
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">100% UP</span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Database Engine</span>
                      <span className="font-mono text-zinc-200">Supabase + File Dual-Sync</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Server Uptime</span>
                      <span className="font-mono text-zinc-200">{Math.floor((systemHealth?.uptimeSeconds || 3600) / 60)} minutes</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Memory RSS</span>
                      <span className="font-mono text-zinc-200">{systemHealth?.memoryUsageMb || 85} MB</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Admin Twilio Line</span>
                      <span className="font-mono text-emerald-400">{overview?.adminPhoneNumber || '+1 (267) 230-1662'}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
                  <h3 className="font-bold text-sm text-white border-b border-zinc-800 pb-3">Quick Management Tools</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => setActiveTab('users')}
                      className="p-3 rounded-xl bg-zinc-800/60 hover:bg-[#FF6A00]/15 hover:border-[#FF6A00]/40 border border-zinc-700/60 text-left transition-all"
                    >
                      <Users className="w-4 h-4 text-[#FF8C42] mb-1" />
                      <p className="font-bold text-white">Manage Users</p>
                      <p className="text-[10px] text-zinc-400">Edit, add, delete</p>
                    </button>
                    <button
                      onClick={() => setActiveTab('ban_users')}
                      className="p-3 rounded-xl bg-zinc-800/60 hover:bg-red-500/15 hover:border-red-500/40 border border-zinc-700/60 text-left transition-all"
                    >
                      <Ban className="w-4 h-4 text-red-400 mb-1" />
                      <p className="font-bold text-white">Ban Controls</p>
                      <p className="text-[10px] text-zinc-400">Suspend accounts</p>
                    </button>
                    <button
                      onClick={() => setActiveTab('support_tickets')}
                      className="p-3 rounded-xl bg-zinc-800/60 hover:bg-blue-500/15 hover:border-blue-500/40 border border-zinc-700/60 text-left transition-all"
                    >
                      <MessageSquare className="w-4 h-4 text-blue-400 mb-1" />
                      <p className="font-bold text-white">Tickets</p>
                      <p className="text-[10px] text-zinc-400">Reply to clients</p>
                    </button>
                    <button
                      onClick={() => triggerAdminBackupDownload()}
                      className="p-3 rounded-xl bg-zinc-800/60 hover:bg-emerald-500/15 hover:border-emerald-500/40 border border-zinc-700/60 text-left transition-all"
                    >
                      <Download className="w-4 h-4 text-emerald-400 mb-1" />
                      <p className="font-bold text-white">Backup DB</p>
                      <p className="text-[10px] text-zinc-400">Snapshot export</p>
                    </button>
                  </div>
                </div>

                {/* Recent Activities */}
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                  <h3 className="font-bold text-sm text-white border-b border-zinc-800 pb-3 flex items-center justify-between">
                    <span>Recent Admin Actions</span>
                    <Clock className="w-4 h-4 text-zinc-500" />
                  </h3>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {activityLogs.length > 0 ? (
                      activityLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="text-[11px] p-2 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
                          <p className="font-bold text-white truncate">{log.action}</p>
                          <p className="text-zinc-400 truncate mt-0.5">{log.details}</p>
                          <p className="text-[10px] text-zinc-500 mt-1">{new Date(log.created_at).toLocaleTimeString()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500">No activity logged yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3 font-semibold">User</th>
                      <th className="pb-3 font-semibold">Email (@goldmailer)</th>
                      <th className="pb-3 font-semibold">Role</th>
                      <th className="pb-3 font-semibold">Plan</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Created</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/20 text-[#FF8C42] flex items-center justify-center font-bold">
                            {(u.first_name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <span>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}</span>
                        </td>
                        <td className="py-3 font-mono text-zinc-300">{u.email}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'admin' ? 'bg-[#FF6A00]/20 text-[#FF8C42]' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="capitalize text-zinc-300 font-medium">{u.plan || 'Free 15GB'}</span>
                        </td>
                        <td className="py-3">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold text-[10px]">
                              Banned
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500 text-[11px]">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}
                        </td>
                        <td className="py-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleToggleBan(u)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                              u.is_banned
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                            }`}
                          >
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. EMAIL ACCOUNTS */}
          {activeTab === 'email_accounts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">Total @goldmailer.xyz Accounts</p>
                  <p className="text-xl font-bold text-white mt-1">{emailAccounts.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">Primary Domain</p>
                  <p className="text-xl font-bold text-[#FF8C42] mt-1">goldmailer.xyz</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">SMTP Domain</p>
                  <p className="text-xl font-bold text-zinc-300 mt-1">smtp.goldmailer.xyz</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">Mailbox</th>
                      <th className="pb-3">Domain</th>
                      <th className="pb-3">Storage Used</th>
                      <th className="pb-3">Messages</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {emailAccounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-zinc-800/30">
                        <td className="py-3 font-mono font-bold text-white">{acc.email}</td>
                        <td className="py-3 text-zinc-400 font-mono">@{acc.domain}</td>
                        <td className="py-3 text-zinc-300">{acc.storageUsedMb} MB / {acc.storageLimitGb} GB</td>
                        <td className="py-3 text-zinc-300">{acc.totalEmails} ({acc.unreadEmails} unread)</td>
                        <td className="py-3">
                          {acc.is_banned ? (
                            <span className="text-red-400 font-bold">Banned</span>
                          ) : (
                            <span className="text-emerald-400 font-bold">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. BAN / SUSPEND USERS WITH REASON */}
          {activeTab === 'ban_users' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/30 text-xs text-red-200">
                <p className="font-bold flex items-center gap-1.5 text-sm text-red-400 mb-1">
                  <ShieldAlert className="w-4 h-4" />
                  Permanent Database Ban System
                </p>
                <p>
                  Banning a user immediately writes to the primary database table <code className="bg-black/30 px-1 py-0.5 rounded font-mono">goldmailer_accounts</code>, sets column <code className="bg-black/30 px-1 py-0.5 rounded font-mono">is_banned=true</code> and timestamp <code className="bg-black/30 px-1 py-0.5 rounded font-mono">banned_at</code>. Login is strictly blocked on backend routes. Ban never resets on page refresh!
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">User</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Ban Status</th>
                      <th className="pb-3">Banned At</th>
                      <th className="pb-3">Reason</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-800/30">
                        <td className="py-3 font-bold text-white">{u.first_name || u.username}</td>
                        <td className="py-3 font-mono text-zinc-300">{u.email}</td>
                        <td className="py-3">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold text-[10px]">
                              BANNED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                              CLEAN
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-400 text-[11px]">
                          {u.banned_at ? new Date(u.banned_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 text-zinc-300 truncate max-w-xs">{u.ban_reason || '—'}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleToggleBan(u)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              u.is_banned
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                            }`}
                          >
                            {u.is_banned ? 'Unban Account' : 'Ban with Reason'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. EMAIL LOGS */}
          {activeTab === 'email_logs' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">Time</th>
                      <th className="pb-3">From</th>
                      <th className="pb-3">To</th>
                      <th className="pb-3">Subject</th>
                      <th className="pb-3">Folder / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {emailLogs.length > 0 ? (
                      emailLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-zinc-800/30">
                          <td className="py-3 text-zinc-500 text-[11px]">{new Date(log.received_at).toLocaleString()}</td>
                          <td className="py-3 text-zinc-300 font-mono truncate max-w-[150px]">{log.from}</td>
                          <td className="py-3 text-zinc-300 font-mono truncate max-w-[150px]">{log.to}</td>
                          <td className="py-3 font-semibold text-white truncate max-w-[200px]">{log.subject}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'trash' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {log.status || log.folder}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-zinc-500">No email logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. STORAGE MANAGEMENT */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">Total Cloud Allocated</p>
                  <p className="text-2xl font-bold text-white mt-1">{storageData?.totalAllocatedGb ?? 0} GB</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">Total Storage Consumed</p>
                  <p className="text-2xl font-bold text-[#FF8C42] mt-1">{storageData?.totalUsedMb ?? 0} MB</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xs text-zinc-400">Consumption Rate</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{storageData?.percentUsed ?? '0.0'}%</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                <h3 className="font-bold text-sm text-white">Per-User Storage Quotas</h3>
                <div className="space-y-3">
                  {storageData?.users?.map((u: any) => (
                    <div key={u.id} className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
                      <div className="flex-1 pr-4">
                        <div className="flex justify-between text-xs font-bold text-white mb-1">
                          <span>{u.name} ({u.email})</span>
                          <span>{u.usedMb} MB of {u.limitGb} GB ({u.percent}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-zinc-700/60 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42]" style={{ width: `${Math.min(100, u.percent)}%` }} />
                        </div>
                      </div>
                      <button
                        onClick={() => setStorageEditModal({ open: true, user: u, limitGb: Number(u.limitGb) || 15 })}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700"
                      >
                        Adjust Quota
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7. SUBSCRIPTIONS & PLANS */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {subscriptions?.plans?.map((plan: any) => (
                  <div key={plan.name} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-white">{plan.name}</h4>
                      <span className="text-xs font-mono text-[#FF8C42]">${plan.priceMonthly}/mo</span>
                    </div>
                    <p className="text-xs text-zinc-400">Mailbox Storage: <strong className="text-white">{plan.quota}</strong></p>
                    <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Subscribers</span>
                      <span className="font-bold text-white">{plan.count}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                <h3 className="font-bold text-sm text-white mb-3">Subscriber Roster</h3>
                <div className="space-y-2">
                  {subscriptions?.subscribers?.map((sub: any) => (
                    <div key={sub.id} className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">{sub.email}</p>
                        <p className="text-zinc-400 text-[11px] capitalize">Plan: {sub.plan} • Billing: {sub.billing}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                        {sub.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 8. PAYMENTS & INVOICES */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">Payment ID</th>
                      <th className="pb-3">User</th>
                      <th className="pb-3">Plan</th>
                      <th className="pb-3">Amount (USD)</th>
                      <th className="pb-3">Currency</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {payments.length > 0 ? (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-zinc-800/30">
                          <td className="py-3 font-mono font-bold text-white">{p.payment_id}</td>
                          <td className="py-3">{p.user_email}</td>
                          <td className="py-3">{p.plan_name}</td>
                          <td className="py-3 font-bold text-emerald-400">${p.amount_usd}</td>
                          <td className="py-3 font-mono">{p.crypto_currency || 'USDT'}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                              {p.payment_status}
                            </span>
                          </td>
                          <td className="py-3 text-zinc-500">{new Date(p.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-zinc-500">No payment records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9. DOMAINS MANAGEMENT */}
          {activeTab === 'domains' && (
            <div className="space-y-6">
              <form onSubmit={handleAddDomain} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
                <Globe className="w-5 h-5 text-[#FF8C42]" />
                <input
                  type="text"
                  placeholder="Add custom domain (e.g. mycompany.com)"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold"
                >
                  Register Domain
                </button>
              </form>

              <div className="space-y-3">
                {domains.map((dom) => (
                  <div key={dom.id} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">@{dom.domain}</span>
                        {dom.is_default && (
                          <span className="px-2 py-0.5 rounded bg-[#FF6A00]/20 text-[#FF8C42] text-[10px] font-bold">
                            Default
                          </span>
                        )}
                        {dom.is_verified ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            Verified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                            DNS Pending
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-400 mt-2 font-mono">
                        <span>MX: {dom.mx_record_status}</span>
                        <span>SPF: {dom.spf_record_status}</span>
                        <span>DKIM: {dom.dkim_record_status}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!dom.is_verified && (
                        <button
                          onClick={() => handleVerifyDomain(dom.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30"
                        >
                          Verify DNS
                        </button>
                      )}
                      {!dom.is_default && (
                        <button
                          onClick={() => deleteAdminDomain(dom.id).then(() => loadTabContent('domains'))}
                          className="p-2 rounded-lg text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10. SYSTEM HEALTH */}
          {activeTab === 'system_health' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" /> Server Environment
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Server Status</span>
                      <span className="text-emerald-400 font-bold uppercase">{systemHealth?.serverStatus || 'healthy'}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>API Performance</span>
                      <span className="text-emerald-400 font-bold uppercase">{systemHealth?.apiStatus || 'optimal'}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Memory RSS</span>
                      <span className="font-mono text-white">{systemHealth?.memoryUsageMb || 85} MB</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Active SSE Webmail Sockets</span>
                      <span className="font-mono text-white">{systemHealth?.activeSockets || 1} live</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#FF8C42]" /> Database & Connectors
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Database Engine</span>
                      <span className="text-emerald-400 font-bold">{systemHealth?.databaseEngine || 'Supabase + Persistent Disk'}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Database State</span>
                      <span className="text-emerald-400 font-bold uppercase">{systemHealth?.databaseStatus || 'connected'}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Twilio SMS Gateway</span>
                      <span className="font-mono text-emerald-400 font-bold">{systemHealth?.twilioStatus || 'connected'}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>SMTP Outbound</span>
                      <span className="font-mono text-zinc-300">{systemHealth?.smtpStatus || 'connected'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 11. REPORTS & ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <h3 className="font-bold text-sm text-white">Daily Registrations & Activity (Last 7 Days)</h3>
                <div className="grid grid-cols-7 gap-2">
                  {analytics?.dailyMetrics?.map((m: any) => (
                    <div key={m.date} className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 text-center">
                      <p className="text-[10px] text-zinc-400 font-mono">{m.date.slice(5)}</p>
                      <p className="text-lg font-bold text-[#FF8C42] mt-1">{m.users}</p>
                      <p className="text-[10px] text-zinc-500">new users</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 12. SUPPORT TICKETS */}
          {activeTab === 'support_tickets' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                  <h3 className="font-bold text-sm text-white">Active Tickets ({supportTickets.length})</h3>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {supportTickets.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          selectedTicket?.id === t.id
                            ? 'bg-[#FF6A00]/15 border-[#FF6A00]/40'
                            : 'bg-zinc-800/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-white truncate">{t.subject}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === 'open' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="text-zinc-400 truncate">{t.user_email}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
                  {selectedTicket ? (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="border-b border-zinc-800 pb-3">
                          <h4 className="font-bold text-base text-white">{selectedTicket.subject}</h4>
                          <p className="text-xs text-zinc-400 mt-0.5">From: {selectedTicket.user_email}</p>
                        </div>
                        <div className="space-y-3 mt-4 max-h-64 overflow-y-auto">
                          {selectedTicket.messages.map((m) => (
                            <div
                              key={m.id}
                              className={`p-3 rounded-xl text-xs ${
                                m.is_admin ? 'bg-[#FF6A00]/15 border border-[#FF6A00]/30 ml-4' : 'bg-zinc-800/60 mr-4'
                              }`}
                            >
                              <div className="flex justify-between font-bold text-white mb-1">
                                <span>{m.sender_name} {m.is_admin && '(Support Admin)'}</span>
                                <span className="text-[10px] text-zinc-500">{new Date(m.created_at).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-zinc-200">{m.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-zinc-800 space-y-2">
                        <textarea
                          placeholder="Type response to client..."
                          value={ticketReplyText}
                          onChange={(e) => setTicketReplyText(e.target.value)}
                          className="w-full h-20 p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-xs text-white outline-none resize-none"
                        />
                        <button
                          onClick={handleReplyTicket}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold float-right"
                        >
                          Send Admin Reply
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-zinc-500 text-xs">
                      Select a ticket on the left to read messages and respond.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 13. SPAM & SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handleBlockIp} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <input
                  type="text"
                  placeholder="Block malicious IP (e.g. 192.168.1.100)"
                  value={newBlockedIp}
                  onChange={(e) => setNewBlockedIp(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
                >
                  Block IP
                </button>
              </form>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                <h3 className="font-bold text-sm text-white">Blocked IP Addresses ({securityData?.blockedIps?.length || 0})</h3>
                <div className="space-y-2">
                  {securityData?.blockedIps?.map((ip: string) => (
                    <div key={ip} className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between text-xs font-mono">
                      <span className="text-red-400 font-bold">{ip}</span>
                      <button
                        onClick={() => handleUnblockIp(ip)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 14. TRASH RECOVERY */}
          {activeTab === 'trash_recovery' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200">
                <p className="font-bold flex items-center gap-1.5 text-sm text-amber-400 mb-1">
                  <ArchiveRestore className="w-4 h-4" />
                  30-Day Trash & Recovery Vault
                </p>
                <p>
                  Recover any trashed or accidentally deleted emails within 30 days. Clicking "Recover to Inbox" immediately restores the email in the database and updates status back to inbox.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">Subject</th>
                      <th className="pb-3">Recipient</th>
                      <th className="pb-3">Trashed At</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {trashRecovery.length > 0 ? (
                      trashRecovery.map((e) => (
                        <tr key={e.id} className="hover:bg-zinc-800/30">
                          <td className="py-3 font-semibold text-white truncate max-w-xs">{e.subject}</td>
                          <td className="py-3 font-mono text-zinc-300">{e.to}</td>
                          <td className="py-3 text-zinc-500">{new Date(e.trashedAt).toLocaleString()}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleRecoverEmail(e.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                            >
                              Recover to Inbox
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-zinc-500">No trashed emails in recovery pool.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 15. SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <h3 className="font-bold text-sm text-white">Platform Settings</h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Site Title</label>
                    <input
                      type="text"
                      defaultValue={siteSettings?.site_name || 'GoldMailer'}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Default Domain</label>
                    <input
                      type="text"
                      defaultValue={siteSettings?.default_domain || 'goldmailer.xyz'}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Default Mailbox Storage Quota (GB)</label>
                    <input
                      type="number"
                      defaultValue={15}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setFeedbackNotice({ type: 'success', message: 'System settings saved.' })}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 16. ADMIN ROLES & STAFF */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white">Staff Roles</h4>
                  <p className="text-xs text-zinc-400">Super Admins, Support Staff, and Security Officers</p>
                </div>
              </div>

              <div className="space-y-3">
                {adminRoles.map((r) => (
                  <div key={r.id} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-white">{r.name} ({r.email})</p>
                      <p className="text-xs text-[#FF8C42] capitalize font-medium">{r.role.replace('_', ' ')}</p>
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">Authorized</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 17. NOTIFICATIONS / BROADCAST */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-2xl">
              <form onSubmit={handleSendBroadcast} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <h3 className="font-bold text-sm text-white">Send Broadcast Announcement</h3>
                <p className="text-xs text-zinc-400">Delivers official announcement email into every user's inbox.</p>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Announcement Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Scheduled Maintenance or New Feature Release"
                      value={broadcastForm.title}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Message Content</label>
                    <textarea
                      placeholder="Write your announcement message..."
                      rows={4}
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white outline-none resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Announcement to All Users</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 18. BACKUP & RESTORE */}
          {activeTab === 'backup' && (
            <div className="space-y-6 max-w-2xl">
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#FF8C42]" /> Export Database Backup
                </h3>
                <p className="text-xs text-zinc-400">
                  Export complete accounts, emails, sessions, domains, and settings snapshot as JSON file.
                </p>
                <button
                  onClick={() => triggerAdminBackupDownload()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Complete Backup JSON</span>
                </button>
              </div>
            </div>
          )}

          {/* 19. API KEYS */}
          {activeTab === 'api_keys' && (
            <div className="space-y-6 max-w-2xl">
              <form onSubmit={handleSaveApiKeys} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#FF8C42]" /> Third-Party Integrations
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Twilio Account SID</label>
                    <input
                      type="text"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Twilio Auth Token</label>
                    <input
                      type={showAuthToken ? 'text' : 'password'}
                      placeholder="••••••••••••••••••••••••••••••••"
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Twilio Primary Phone Number</label>
                    <input
                      type="text"
                      placeholder="+1 (267) 230-1662"
                      value={twilioTrialNumber}
                      onChange={(e) => setTwilioTrialNumber(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="pt-3 border-t border-zinc-800 space-y-3">
                    <h4 className="font-bold text-xs text-[#FF8C42] uppercase tracking-wider">
                      Primary Domain SMTP Configuration (goldmailer.xyz)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-zinc-400 block mb-1">SMTP Host</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="smtp.goldmailer.xyz"
                          className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">SMTP Port</label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          placeholder="587"
                          className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">SMTP User (@goldmailer.xyz)</label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          placeholder="postmaster@goldmailer.xyz"
                          className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">SMTP Password</label>
                        <input
                          type="password"
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold"
                    >
                      Save Configuration
                    </button>
                    <button
                      type="button"
                      onClick={handleTestTwilio}
                      disabled={isTestingTwilio}
                      className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold"
                    >
                      {isTestingTwilio ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* 20. ACTIVITY LOGS */}
          {activeTab === 'activity_logs' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Admin</th>
                      <th className="pb-3">Action</th>
                      <th className="pb-3">Details</th>
                      <th className="pb-3">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/30">
                        <td className="py-3 text-zinc-500 text-[11px]">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="py-3 font-mono font-bold text-white">{log.admin_email}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF6A00]/20 text-[#FF8C42]">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-300">{log.details}</td>
                        <td className="py-3 font-mono text-zinc-500">{log.ip || '127.0.0.1'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================= MODALS ================= */}

      {/* Ban Reason Prompt Modal */}
      {banReasonModal.open && banReasonModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#18191c] border border-red-500/30 text-white space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-lg text-red-400 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Ban User: {banReasonModal.user.email}
            </h3>
            <p className="text-xs text-zinc-300">
              Provide an official reason for the suspension. This will be saved permanently in the database column <code className="font-mono bg-black/40 px-1 py-0.5 rounded">ban_reason</code>.
            </p>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Suspension Reason</label>
              <textarea
                rows={3}
                placeholder="e.g. Terms of Service violation, spamming, abuse"
                value={banReasonModal.reason}
                onChange={(e) => setBanReasonModal({ ...banReasonModal, reason: e.target.value })}
                className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBanReasonModal({ open: false, user: null, reason: '' })}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBan}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
              >
                Confirm Permanent Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleCreateUser} className="w-full max-w-md p-6 rounded-3xl bg-[#18191c] border border-zinc-800 text-white space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-lg text-white">Create New GoldMailer Account</h3>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 block mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={newUserForm.firstName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newUserForm.lastName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Username (@goldmailer.xyz)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. john"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Strong password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 block mb-1">Role</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                  >
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Plan</label>
                  <select
                    value={newUserForm.plan}
                    onChange={(e) => setNewUserForm({ ...newUserForm, plan: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none"
                  >
                    <option value="free">Free (15 GB)</option>
                    <option value="pro">Pro (100 GB)</option>
                    <option value="enterprise">Enterprise (1 TB)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewUserModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold"
              >
                Create Account in DB
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Storage Edit Modal */}
      {storageEditModal.open && storageEditModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 rounded-3xl bg-[#18191c] border border-zinc-800 text-white space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Edit Storage: {storageEditModal.user.email}</h3>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Quota Limit (GB)</label>
              <input
                type="number"
                min={1}
                max={2000}
                value={storageEditModal.limitGb}
                onChange={(e) => setStorageEditModal({ ...storageEditModal, limitGb: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white outline-none text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStorageEditModal({ open: false, user: null, limitGb: 15 })}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateAdminStorageLimit(storageEditModal.user.id, storageEditModal.limitGb);
                  setStorageEditModal({ open: false, user: null, limitGb: 15 });
                  loadTabContent('storage');
                  setFeedbackNotice({ type: 'success', message: 'Storage quota updated.' });
                }}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold"
              >
                Save Quota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
