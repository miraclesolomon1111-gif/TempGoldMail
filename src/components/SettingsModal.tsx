import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  Smartphone,
  KeyRound,
  QrCode,
  Download,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Bell,
  HardDrive,
  AlertCircle,
  Laptop,
  Mail,
  Trash2,
  ExternalLink,
  ArrowRight,
  Link2,
  CornerUpRight,
  Send,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import QRCode from 'qrcode';
import { UserProfile, UserDevice, ConnectedEmail, ForwardingSettings, ForwardingAddress } from '../types';
import {
  setup2FA,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
  fetchUserDevices,
  revokeAllOtherDevices,
  revokeSession,
  updateUserProfile,
  fetchCurrentUser,
  fetchConnectedEmails,
  requestConnectedEmailVerification,
  verifyConnectedEmailCode,
  deleteConnectedEmail,
  syncConnectedEmail,
  toggleConnectedEmailForwarding,
  fetchGoogleOAuthConfig,
  saveGoogleOAuthConfig,
  fetchForwardingSettings,
  addForwardingAddress,
  verifyForwardingAddress,
  updateForwardingSettings,
  deleteForwardingAddress,
  testForwardingDelivery
} from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  user: UserProfile | null;
  onUserUpdated: (u: UserProfile) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  initialTab?: 'general' | 'security' | 'devices' | 'connected_emails' | 'forwarding';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeEmail,
  user,
  onUserUpdated,
  darkMode,
  onToggleDarkMode,
  initialTab = 'devices'
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'devices' | 'connected_emails' | 'forwarding'>(initialTab);

  // Email Forwarding State (Google Gmail style)
  const [forwardingSettings, setForwardingSettings] = useState<ForwardingSettings>({
    forwarding_enabled: Boolean(user?.forwarding_enabled),
    forwarding_email: user?.forwarding_email || '',
    forwarding_action: user?.forwarding_action || 'keep',
    forwarding_addresses: user?.forwarding_addresses || []
  });
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(Boolean(user?.forwarding_enabled));
  const [selectedForwardEmail, setSelectedForwardEmail] = useState(user?.forwarding_email || '');
  const [forwardAction, setForwardAction] = useState<'keep' | 'read' | 'archive' | 'delete'>(user?.forwarding_action || 'keep');
  const [newForwardEmail, setNewForwardEmail] = useState('');
  const [forwardCodeInput, setForwardCodeInput] = useState('');
  const [forwardStep, setForwardStep] = useState<'idle' | 'input' | 'verify'>('idle');
  const [pendingForwardVerifyEmail, setPendingForwardVerifyEmail] = useState<string | null>(null);
  const [isAddingForward, setIsAddingForward] = useState(false);
  const [isVerifyingForward, setIsVerifyingForward] = useState(false);
  const [isSavingForwardSettings, setIsSavingForwardSettings] = useState(false);
  const [isTestingForward, setIsTestingForward] = useState(false);

  // Connected Emails state
  const [connectedEmails, setConnectedEmails] = useState<ConnectedEmail[]>([]);
  const [isLoadingConnected, setIsLoadingConnected] = useState(false);
  const [gmailAddressInput, setGmailAddressInput] = useState('');
  const [verificationCodeInput, setVerificationCodeInput] = useState('');
  const [verificationStep, setVerificationStep] = useState<'input' | 'code' | 'verified'>('input');
  const [pendingVerifiedEmail, setPendingVerifiedEmail] = useState<string | null>(null);
  const [pendingConnectedId, setPendingConnectedId] = useState<string | null>(null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSyncingId, setIsSyncingId] = useState<string | null>(null);
  const [oauthConfig, setOAuthConfig] = useState<{ redirect_uri: string; javascript_origin: string; is_configured: boolean; client_id?: string } | null>(null);
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [isSavingOAuth, setIsSavingOAuth] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [showConfigHelper, setShowConfigHelper] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user?.two_factor_enabled));
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string>(() => {
    try {
      return localStorage.getItem('gm_pending_2fa_secret') || '';
    } catch {
      return '';
    }
  });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>(user?.backup_codes || []);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState(user?.recovery_phone || user?.phone || '');
  const [backupEmail, setBackupEmail] = useState(user?.backup_email || (user as any)?.recovery_email || '');

  // Devices state
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setTwoFactorEnabled(Boolean(user.two_factor_enabled));
      setBackupCodes(user.backup_codes || []);
      setRecoveryPhone(user.recovery_phone || user.phone || '');
      setBackupEmail(user.backup_email || (user as any).recovery_email || '');
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      loadDevices();
      loadConnectedEmails();
      loadOAuthConfig();
      loadForwardingSettings();
      // Fresh sync of user security & recovery state
      fetchCurrentUser().then((freshUser) => {
        if (freshUser) {
          onUserUpdated(freshUser);
          setTwoFactorEnabled(Boolean(freshUser.two_factor_enabled));
          if (freshUser.backup_codes && freshUser.backup_codes.length > 0) {
            setBackupCodes(freshUser.backup_codes);
          }
          if (freshUser.recovery_phone !== undefined) {
            setRecoveryPhone(freshUser.recovery_phone || freshUser.phone || '');
          }
          if (freshUser.backup_email !== undefined) {
            setBackupEmail(freshUser.backup_email || (freshUser as any).recovery_email || '');
          }
        }
      }).catch(() => {});
    }
  }, [isOpen, initialTab]);

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const list = await fetchUserDevices();
      if (list && list.length > 0) {
        setDevices(list);
      } else {
        // Fallback: Detect and display the current active device
        const curUa = navigator.userAgent;
        let browser = 'Browser';
        if (curUa.includes('Edg')) browser = 'Edge';
        else if (curUa.includes('Chrome')) browser = 'Chrome';
        else if (curUa.includes('Safari')) browser = 'Safari';
        else if (curUa.includes('Firefox')) browser = 'Firefox';

        let os = 'Device';
        if (curUa.includes('Android')) os = 'Android';
        else if (curUa.includes('iPhone') || curUa.includes('iPad')) os = 'iOS';
        else if (curUa.includes('Windows')) os = 'Windows 11';
        else if (curUa.includes('Mac')) os = 'macOS';
        else if (curUa.includes('Linux')) os = 'Linux';

        setDevices([{
          id: 'dev_curr_' + Date.now(),
          user_id: user?.id || 'current',
          device_name: `${browser} on ${os}`,
          browser,
          os,
          ip: 'Current IP',
          ip_address: 'Current IP',
          city: '',
          country: '',
          location: 'Current Device',
          last_active: new Date().toISOString(),
          is_trusted: true,
          is_current: true,
          created_at: new Date().toISOString()
        }]);
      }
    } catch {
      setDevices([]);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const loadConnectedEmails = async () => {
    setIsLoadingConnected(true);
    try {
      const list = await fetchConnectedEmails(user?.id);
      setConnectedEmails(list);
    } catch {
      setConnectedEmails([]);
    } finally {
      setIsLoadingConnected(false);
    }
  };

  const loadOAuthConfig = async () => {
    try {
      const cfg = await fetchGoogleOAuthConfig();
      setOAuthConfig(cfg);
    } catch {}
  };

  const loadForwardingSettings = async () => {
    try {
      const data = await fetchForwardingSettings();
      setForwardingSettings(data);
      setIsForwardingEnabled(data.forwarding_enabled);
      const activeOrFirst = data.forwarding_email || (data.forwarding_addresses.find(a => a.verified)?.email || '');
      setSelectedForwardEmail(activeOrFirst);
      setForwardAction(data.forwarding_action || 'keep');
    } catch {}
  };

  const handleAddForwardAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForwardEmail.trim()) return;
    setIsAddingForward(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await addForwardingAddress(newForwardEmail.trim());
      setPendingForwardVerifyEmail(newForwardEmail.trim().toLowerCase());
      setForwardStep('verify');
      if (res.code) {
        setForwardCodeInput(res.code);
      }
      setSuccessMsg(res.message || `Confirmation code sent to ${newForwardEmail.trim()}`);
    } catch (err: any) {
      setError(err.message || 'Failed to add forwarding address');
    } finally {
      setIsAddingForward(false);
    }
  };

  const handleVerifyForwardCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingForwardVerifyEmail || !forwardCodeInput.trim()) return;
    setIsVerifyingForward(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await verifyForwardingAddress(pendingForwardVerifyEmail, forwardCodeInput.trim());
      setForwardStep('idle');
      setNewForwardEmail('');
      setForwardCodeInput('');
      setSelectedForwardEmail(pendingForwardVerifyEmail);
      setIsForwardingEnabled(true);
      await loadForwardingSettings();
      setSuccessMsg(`Verified ${pendingForwardVerifyEmail} successfully! You can now enable forwarding.`);
    } catch (err: any) {
      setError(err.message || 'Invalid confirmation code');
    } finally {
      setIsVerifyingForward(false);
    }
  };

  const handleSaveForwarding = async () => {
    setIsSavingForwardSettings(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await updateForwardingSettings({
        enabled: isForwardingEnabled,
        forwarding_email: selectedForwardEmail,
        action: forwardAction
      });
      if (user) {
        onUserUpdated({
          ...user,
          forwarding_enabled: isForwardingEnabled,
          forwarding_email: selectedForwardEmail,
          forwarding_action: forwardAction,
          forwarding: {
            enabled: isForwardingEnabled,
            forwardTo: selectedForwardEmail,
            keepCopy: true
          }
        });
      }
      await loadForwardingSettings();
      setSuccessMsg(res.message || 'Forwarding settings saved successfully in Firestore');
    } catch (err: any) {
      setError(err.message || 'Failed to update forwarding settings');
    } finally {
      setIsSavingForwardSettings(false);
    }
  };

  const handleDeleteForwardAddress = async (emailToDelete: string) => {
    if (!confirm(`Are you sure you want to remove ${emailToDelete}?`)) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteForwardingAddress(emailToDelete);
      await loadForwardingSettings();
      setSuccessMsg(`Forwarding address ${emailToDelete} removed`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete forwarding address');
    }
  };

  const handleTestForwardDelivery = async () => {
    setIsTestingForward(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await testForwardingDelivery();
      setSuccessMsg(res.message || 'Test forwarded email dispatched successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to trigger test forward');
    } finally {
      setIsTestingForward(false);
    }
  };

  // Step 1: Request 6-digit verification code sent to Gmail
  const handleRequestVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmailAddressInput.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setIsRequestingCode(true);
    try {
      const res = await requestConnectedEmailVerification(gmailAddressInput.trim(), user?.id);
      setVerificationStep('code');
      setSuccessMsg(res.message || `We sent a 6-digit code to ${gmailAddressInput.trim()}, check inbox`);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsRequestingCode(false);
    }
  };

  // Step 2: Confirm 6-digit code
  const handleConfirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCodeInput.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setIsVerifyingCode(true);
    try {
      const res = await verifyConnectedEmailCode(gmailAddressInput.trim(), verificationCodeInput.trim(), user?.id);
      setPendingVerifiedEmail(res.connectedEmail.email);
      setPendingConnectedId(res.connectedEmail.id);
      setVerificationStep('verified');
      setSuccessMsg(res.message || 'Code confirmed successfully! Now connect Gmail to enable auto-forwarding.');
      loadConnectedEmails();
    } catch (err: any) {
      setError(err.message || 'Failed to verify code');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Step 3: Google OAuth auto-forward button
  const handleStartGoogleOAuth = async (connectedId?: string) => {
    setError(null);
    try {
      const targetId = connectedId || pendingConnectedId || '';
      const res = await fetch(`/api/auth/google/url?connectedEmailId=${encodeURIComponent(targetId)}`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        setShowConfigHelper(true);
        throw new Error(data.error || 'Please configure Google OAuth Client ID before connecting.');
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || 'Could not initiate Google OAuth');
    }
  };

  // Disconnect / Remove account
  const handleDeleteConnected = async (id: string) => {
    setError(null);
    try {
      await deleteConnectedEmail(id);
      setConnectedEmails(prev => prev.filter(c => c.id !== id));
      setSuccessMsg('Gmail connected account disconnected');
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect account');
    }
  };

  // Toggle Auto-Forwarding
  const handleToggleForwarding = async (id: string, currentEnabled: boolean) => {
    try {
      const updated = await toggleConnectedEmailForwarding(id, !currentEnabled);
      setConnectedEmails(prev => prev.map(c => c.id === id ? updated : c));
    } catch (err: any) {
      setError(err.message || 'Failed to update forwarding state');
    }
  };

  // Manual Sync Now
  const handleSyncConnected = async (id: string) => {
    setIsSyncingId(id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await syncConnectedEmail(id);
      setSuccessMsg(res.message || 'Gmail sync completed');
      loadConnectedEmails();
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setIsSyncingId(null);
    }
  };

  // Save Google OAuth Credentials from UI
  const handleSaveOAuthCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customClientId.trim() || !customClientSecret.trim()) return;
    setIsSavingOAuth(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await saveGoogleOAuthConfig(customClientId.trim(), customClientSecret.trim());
      setSuccessMsg('Google OAuth credentials saved successfully!');
      loadOAuthConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to save Google OAuth configuration');
    } finally {
      setIsSavingOAuth(false);
    }
  };

  if (!isOpen) return null;

  // Start 2FA Setup
  const handleStart2FASetup = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await setup2FA();
      setTotpSecret(res.secret);
      try {
        localStorage.setItem('gm_pending_2fa_secret', res.secret);
      } catch {}
      const dataUrl = await QRCode.toDataURL(res.otpauth_url, { width: 180, margin: 1 });
      setQrCodeDataUrl(dataUrl);
      setIsSettingUp2FA(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start 2FA setup');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify & Enable 2FA
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await enable2FA(verifyCode.trim(), totpSecret);
      setTwoFactorEnabled(true);
      setBackupCodes(res.backup_codes);
      setIsSettingUp2FA(false);
      try {
        localStorage.removeItem('gm_pending_2fa_secret');
      } catch {}
      setSuccessMsg('2-Step Verification is now enabled on your account!');
      if (res.user) {
        onUserUpdated(res.user);
      } else if (user) {
        onUserUpdated({ ...user, two_factor_enabled: true, backup_codes: res.backup_codes });
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code. Please check your Authenticator app.');
    } finally {
      setIsLoading(false);
    }
  };

  // Disable 2FA
  const handleDisable2FA = async () => {
    if (!confirm('Are you sure you want to disable 2-Step Verification?')) return;
    setIsLoading(true);
    try {
      const res = await disable2FA();
      setTwoFactorEnabled(false);
      setSuccessMsg('2-Step Verification has been disabled.');
      if (res.user) {
        onUserUpdated(res.user);
      } else if (user) {
        onUserUpdated({ ...user, two_factor_enabled: false });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate Backup codes
  const handleRegenerateCodes = async () => {
    setIsLoading(true);
    try {
      const res = await regenerateBackupCodes();
      setBackupCodes(res.backup_codes);
      setSuccessMsg('10 fresh backup codes generated.');
      if (res.user) {
        onUserUpdated(res.user);
      } else if (user) {
        onUserUpdated({ ...user, backup_codes: res.backup_codes });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const downloadBackupCodes = () => {
    const blob = new Blob([
      `GoldMailer 2-Step Verification Backup Codes\nAccount: ${activeEmail}\nGenerated: ${new Date().toLocaleString()}\n\n` +
      backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nEach code is single-use only.`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goldmailer_backup_codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Revoke all other devices
  const handleRevokeOtherDevices = async () => {
    if (!confirm('Sign out of all other devices except this one?')) return;
    try {
      await revokeAllOtherDevices();
      loadDevices();
      setSuccessMsg('Signed out of all other active sessions.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Logout specific device (Requirement 3)
  const handleLogoutDevice = async (d: UserDevice) => {
    if (!confirm(`Sign out ${d.device_name || 'this device'} (${d.ip})?`)) return;
    try {
      await revokeSession(d.session_token || d.id);
      loadDevices();
      setSuccessMsg(`Signed out of ${d.device_name || 'device'}.`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const formatLastActive = (dateStr: string, isCurrent?: boolean) => {
    if (isCurrent) return 'Current device';
    if (!dateStr) return 'Recently';
    try {
      const date = new Date(dateStr);
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  // Save Recovery Contacts
  const handleSaveRecovery = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const updated = await updateUserProfile({
        recovery_phone: recoveryPhone.trim(),
        backup_email: backupEmail.trim(),
        recovery_email: backupEmail.trim()
      });
      try {
        const token = localStorage.getItem("goldmailer_token") || "";
        await fetch("/api/account/recovery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ recovery_email: backupEmail.trim() })
        });
      } catch {}
      onUserUpdated(updated);
      setRecoveryPhone(updated.recovery_phone || recoveryPhone.trim());
      setBackupEmail(updated.backup_email || (updated as any).recovery_email || backupEmail.trim());
      setSuccessMsg('Recovery details saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save recovery details');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-[#18191c]/95 border-2 border-[#FF6A00]/30 text-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">GoldMailer Settings</h2>
              <p className="text-xs text-zinc-400 font-mono">{activeEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="mt-4 flex gap-2 border-b border-white/10 pb-2 flex-shrink-0 text-xs">
          <button
            onClick={() => { setActiveTab('security'); setError(null); setSuccessMsg(null); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'security' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>2-Step Verification & Security</span>
          </button>
          <button
            onClick={() => { setActiveTab('devices'); setError(null); setSuccessMsg(null); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'devices' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Your Devices</span>
          </button>
          <button
            onClick={() => { setActiveTab('forwarding'); setError(null); setSuccessMsg(null); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'forwarding' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CornerUpRight className="w-3.5 h-3.5" />
            <span>Forwarding</span>
          </button>
          <button
            onClick={() => { setActiveTab('connected_emails'); setError(null); setSuccessMsg(null); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'connected_emails' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail Sync</span>
          </button>
          <button
            onClick={() => { setActiveTab('general'); setError(null); setSuccessMsg(null); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'general' ? 'bg-[#FF6A00] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            General & Theme
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content area */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* TAB 1: SECURITY & 2FA */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* 2FA Master Toggle Box */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>2-Step Verification</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      twoFactorEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      {twoFactorEnabled ? 'Active & Protected' : 'Disabled'}
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    Protect your account with an Authenticator app (Google Authenticator) code on new sign-ins.
                  </p>
                </div>

                {twoFactorEnabled ? (
                  <button
                    type="button"
                    onClick={handleDisable2FA}
                    className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStart2FASetup}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold shadow"
                  >
                    Turn On
                  </button>
                )}
              </div>

              {/* In-progress TOTP Setup Wizard */}
              {isSettingUp2FA && (
                <div className="p-4 bg-black/50 border-2 border-[#FF6A00]/40 rounded-2xl space-y-4 animate-in fade-in">
                  <h4 className="text-xs font-bold text-[#FF8C42] uppercase tracking-wider">
                    Setup Google Authenticator / TOTP
                  </h4>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {qrCodeDataUrl ? (
                      <div className="p-2 bg-white rounded-xl shadow-lg">
                        <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-36 h-36" />
                      </div>
                    ) : (
                      <div className="w-36 h-36 bg-zinc-800 rounded-xl flex items-center justify-center">
                        <QrCode className="w-8 h-8 text-zinc-500" />
                      </div>
                    )}

                    <div className="space-y-2 text-xs flex-1">
                      <p className="text-zinc-300">
                        1. Scan this QR code with <strong>Google Authenticator</strong>, 1Password, or Authy.
                      </p>
                      <p className="text-zinc-400 text-[11px]">
                        Or enter secret manually: <code className="text-[#FF8C42] font-mono select-all bg-black/40 px-1.5 py-0.5 rounded">{totpSecret}</code>
                      </p>

                      <form onSubmit={handleVerify2FA} className="pt-1 flex gap-2">
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value)}
                          placeholder="6-digit code"
                          className="w-32 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest focus:outline-none focus:border-[#FF6A00]"
                        />
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#FF8C42] text-white font-bold"
                        >
                          Verify & Activate
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* 10 Backup Codes Section */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#FF8C42]" />
                    <h4 className="text-xs font-bold text-white">10 Emergency Backup Codes</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {backupCodes.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={copyBackupCodes}
                          className="text-[#FF8C42] hover:underline flex items-center gap-1 font-medium"
                        >
                          {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCodes ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={downloadBackupCodes}
                          className="text-zinc-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleRegenerateCodes}
                      className="text-zinc-400 hover:text-white underline text-[11px]"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-zinc-300 bg-black/40 p-2.5 rounded-xl">
                  {backupCodes.map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-center">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recovery Contacts */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-white">Recovery Contacts</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">Recovery Phone (SMS OTP)</label>
                    <input
                      type="tel"
                      value={recoveryPhone}
                      onChange={(e) => setRecoveryPhone(e.target.value)}
                      placeholder="Add recovery phone (e.g. +1 555 000 0000)"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#FF6A00] placeholder-zinc-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">Backup Email Address</label>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      placeholder="Add recovery email (e.g. name@gmail.com)"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#FF6A00] placeholder-zinc-600 text-xs"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveRecovery}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold"
                >
                  Save Recovery Details
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: DEVICES (Gmail-Style Device Management) */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-white/5 border border-white/10 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white">Your devices</h4>
                  <p className="text-xs text-[#FF8C42] font-semibold mt-0.5">
                    You are currently logged in on {devices.length} device{devices.length === 1 ? '' : 's'}
                  </p>
                </div>
                {devices.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRevokeOtherDevices}
                    className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout from all other devices
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {devices.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-6">No device sessions detected.</p>
                ) : (
                  devices.map((d) => (
                    <div
                      key={d.id || d.session_token}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                        d.is_current
                          ? 'bg-[#FF6A00]/10 border-[#FF6A00]/40 shadow-sm'
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-[#FF8C42] flex-shrink-0">
                          <Laptop className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-xs sm:text-sm truncate">
                              {d.device_name || `${d.browser} on ${d.os}`}
                            </span>
                            {d.is_current && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Current device
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-300 font-mono mt-0.5 truncate">
                            IP: {d.ip || d.ip_address || '127.0.0.1'} - {d.location || [d.city, d.country].filter(Boolean).join(', ') || 'Unknown Location'}
                          </p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Last active: {formatLastActive(d.last_active, d.is_current)}
                          </p>
                        </div>
                      </div>

                      {!d.is_current && (
                        <button
                          type="button"
                          onClick={() => handleLogoutDevice(d)}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/20 hover:text-red-400 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors flex-shrink-0 cursor-pointer"
                        >
                          Logout this device
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={loadDevices}
                  className="text-xs text-[#FF8C42] hover:underline font-medium cursor-pointer"
                >
                  Refresh Devices list &rarr;
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: GENERAL & THEME */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Storage Quota */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[#FF6A00]" />
                    Storage Allocated
                  </span>
                  <span className="text-zinc-400 font-mono">
                    {(user?.storage_used_gb ?? 0).toFixed(2)} GB of {(user?.storage_quota_gb || 15).toFixed(2)} GB ({Math.min(100, ((user?.storage_used_gb ?? 0) / (user?.storage_quota_gb || 15)) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] rounded-full"
                    style={{ width: `${Math.min(100, ((user?.storage_used_gb ?? 0) / (user?.storage_quota_gb || 15)) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Permanent {user?.storage_quota_gb || 15}GB complimentary cloud storage included with every GoldMailer account.
                </p>
              </div>

              {/* Push Notifications */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#FF6A00]" />
                    Push Notifications
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Get instant desktop & mobile alerts whenever a new email arrives
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof window !== 'undefined' && 'Notification' in window) {
                      if (Notification.permission === 'granted') {
                        // Trigger test notification
                        new Notification('🔔 Push Notifications Active', {
                          body: 'TempGoldMail notifications are working properly!',
                          icon: '/favicon.ico'
                        });
                        setSuccessMsg('Test notification dispatched!');
                      } else {
                        const perm = await Notification.requestPermission();
                        if (perm === 'granted') {
                          setSuccessMsg('Push notifications enabled!');
                        } else {
                          setError('Notification permission was declined.');
                        }
                      }
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-90 text-white font-semibold text-xs transition-opacity cursor-pointer shadow-md"
                >
                  {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
                    ? 'Active (Test)'
                    : 'Enable Push'}
                </button>
              </div>

              {/* Theme toggle */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">Color Theme</h4>
                  <p className="text-xs text-zinc-400">Glassmorphism Orange theme styling</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold"
                >
                  {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CONNECTED EMAILS & GMAIL AUTO-FORWARD */}
          {activeTab === 'connected_emails' && (
            <div className="space-y-4">
              {/* Header card */}
              <div className="p-4 bg-gradient-to-r from-[#FF6A00]/15 via-white/5 to-white/5 border border-[#FF6A00]/30 rounded-2xl">
                <div className="flex items-center gap-2 text-[#FF8C42] font-bold text-sm">
                  <Mail className="w-4 h-4 text-[#FF6A00]" />
                  <span>Gmail to GoldMailer Auto-Forward</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Connect your external Gmail account so incoming emails automatically forward directly into your GoldMailer inbox without ever leaving the UI.
                </p>
              </div>

              {/* Add Gmail Account Wizard */}
              <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>Add Gmail Account</span>
                </h4>

                {/* Step 1: Input Gmail address */}
                {verificationStep === 'input' && (
                  <form onSubmit={handleRequestVerification} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Enter your Gmail address to receive forwarding
                      </label>
                      <input
                        type="email"
                        value={gmailAddressInput}
                        onChange={(e) => setGmailAddressInput(e.target.value)}
                        placeholder="example@gmail.com"
                        required
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isRequestingCode || !gmailAddressInput.trim()}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
                    >
                      {isRequestingCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending code...</span>
                        </>
                      ) : (
                        <>
                          <span>Verify Address</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Step 2: Confirm 6-digit code */}
                {verificationStep === 'code' && (
                  <form onSubmit={handleConfirmCode} className="space-y-3">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
                      We sent a 6-digit code to <strong>{gmailAddressInput}</strong>, check inbox
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Enter 6-digit Verification Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={verificationCodeInput}
                        onChange={(e) => setVerificationCodeInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        required
                        className="w-48 tracking-widest text-center font-mono text-base font-bold px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isVerifyingCode || verificationCodeInput.length !== 6}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
                      >
                        {isVerifyingCode ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Confirming...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirm Code</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVerificationStep('input');
                          setVerificationCodeInput('');
                        }}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold cursor-pointer"
                      >
                        Change Email
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: OAuth Connect */}
                {verificationStep === 'verified' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="font-bold">Address verified: {pendingVerifiedEmail || gmailAddressInput}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Grant Google permissions so GoldMailer can activate true auto-forwarding and sync incoming messages.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartGoogleOAuth(pendingConnectedId || undefined)}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Connect Gmail to Auto-Forward</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVerificationStep('input');
                          setGmailAddressInput('');
                          setVerificationCodeInput('');
                          setPendingVerifiedEmail(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold cursor-pointer"
                      >
                        Add Another
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Accounts List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Connected Accounts ({connectedEmails.length})
                  </h4>
                  <button
                    type="button"
                    onClick={loadConnectedEmails}
                    disabled={isLoadingConnected}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingConnected ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {connectedEmails.length === 0 ? (
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center space-y-1">
                    <p className="text-xs font-semibold text-zinc-300">No Gmail accounts connected yet</p>
                    <p className="text-[11px] text-zinc-500">
                      Add your Gmail above to have emails appear in GoldMailer tagged with "Forwarded from: example@gmail.com".
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connectedEmails.map((conn) => {
                      const isConnected = conn.status === 'connected' && (conn.gmail_access_token || conn.gmail_refresh_token);
                      const isSyncing = isSyncingId === conn.id;

                      return (
                        <div
                          key={conn.id}
                          className="p-3.5 bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{conn.email}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  isConnected && conn.isForwardingEnabled
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : conn.isVerified
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-zinc-700 text-zinc-400'
                                }`}
                              >
                                {isConnected
                                  ? conn.isForwardingEnabled
                                    ? 'Auto-Forwarding Active'
                                    : 'Forwarding Paused'
                                  : 'OAuth Pending'}
                              </span>
                            </div>

                            <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                              <span>Forwarding to: <span className="font-mono text-zinc-300">{conn.forwardingAddress || 'Inbox'}</span></span>
                              {conn.lastSyncedAt && (
                                <span>Synced: <span className="font-mono text-zinc-300">{new Date(conn.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                            {isConnected ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSyncConnected(conn.id)}
                                  disabled={isSyncing}
                                  title="Sync emails from Gmail now"
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleForwarding(conn.id, conn.isForwardingEnabled)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                    conn.isForwardingEnabled
                                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                  }`}
                                >
                                  {conn.isForwardingEnabled ? 'Enabled' : 'Paused'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartGoogleOAuth(conn.id)}
                                className="px-3 py-1 rounded-lg bg-[#FF6A00] text-white text-xs font-bold flex items-center gap-1 shadow cursor-pointer hover:bg-[#FF8C42]"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Connect OAuth</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteConnected(conn.id)}
                              title="Disconnect account"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Google Cloud Setup Instructions & Credentials */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#FF6A00]" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Google Cloud Credentials & Redirect URI
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfigHelper(!showConfigHelper)}
                    className="text-[11px] text-[#FF8C42] hover:underline cursor-pointer"
                  >
                    {showConfigHelper ? 'Hide Config' : 'View Config'}
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Origin */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                      Authorized JavaScript origin
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={oauthConfig?.javascript_origin || (typeof window !== 'undefined' ? window.location.origin : '')}
                        className="flex-1 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-zinc-300 font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = oauthConfig?.javascript_origin || window.location.origin;
                          navigator.clipboard.writeText(val);
                          setCopiedOrigin(true);
                          setTimeout(() => setCopiedOrigin(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedOrigin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Redirect URI */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                      Authorized redirect URI
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={oauthConfig?.redirect_uri || (typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : '')}
                        className="flex-1 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-zinc-300 font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = oauthConfig?.redirect_uri || `${window.location.origin}/api/auth/google/callback`;
                          navigator.clipboard.writeText(val);
                          setCopiedRedirect(true);
                          setTimeout(() => setCopiedRedirect(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedRedirect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedRedirect ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Optional In-app Credentials configuration */}
                {showConfigHelper && (
                  <form onSubmit={handleSaveOAuthCredentials} className="pt-2 border-t border-white/10 space-y-2 animate-in fade-in">
                    <p className="text-[11px] text-zinc-400">
                      You can set <code className="text-[#FF8C42]">GOOGLE_CLIENT_ID</code> and <code className="text-[#FF8C42]">GOOGLE_CLIENT_SECRET</code> in your environment, or save them directly here:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">Client ID</label>
                        <input
                          type="text"
                          value={customClientId}
                          onChange={(e) => setCustomClientId(e.target.value)}
                          placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                          className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">Client Secret</label>
                        <input
                          type="password"
                          value={customClientSecret}
                          onChange={(e) => setCustomClientSecret(e.target.value)}
                          placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                          className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingOAuth || !customClientId.trim() || !customClientSecret.trim()}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingOAuth ? 'Saving...' : 'Save Credentials'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: EMAIL FORWARDING (GOOGLE GMAIL STYLE) */}
          {activeTab === 'forwarding' && (
            <div className="space-y-4">
              {/* Header card */}
              <div className="p-4 bg-gradient-to-r from-[#FF6A00]/15 via-white/5 to-white/5 border border-[#FF6A00]/30 rounded-2xl">
                <div className="flex items-center gap-2 text-[#FF8C42] font-bold text-sm">
                  <CornerUpRight className="w-4 h-4 text-[#FF6A00]" />
                  <span>Forwarding and POP/IMAP</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Forward a copy of your incoming GoldMailer messages to another email address (e.g., Gmail, Outlook, Yahoo, or your personal inbox).
                </p>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                isForwardingEnabled && selectedForwardEmail
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-zinc-400'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isForwardingEnabled && selectedForwardEmail ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`} />
                  <span className="truncate">
                    {isForwardingEnabled && selectedForwardEmail
                      ? `Forwarding is active to: ${selectedForwardEmail}`
                      : 'Forwarding is currently disabled.'}
                  </span>
                </div>
                {isForwardingEnabled && selectedForwardEmail && (
                  <button
                    type="button"
                    onClick={handleTestForwardDelivery}
                    disabled={isTestingForward}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                    title="Send a sample email to verify forwarding delivery"
                  >
                    <Send className={`w-3 h-3 ${isTestingForward ? 'animate-spin' : ''}`} />
                    <span>{isTestingForward ? 'Sending...' : 'Test Delivery'}</span>
                  </button>
                )}
              </div>

              {/* Forwarding Options (Gmail Authenticity) */}
              <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <CornerUpRight className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>Forwarding Rules</span>
                </h4>

                <div className="space-y-3">
                  {/* Option 1: Disable Forwarding */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="forwarding_toggle"
                      checked={!isForwardingEnabled}
                      onChange={() => setIsForwardingEnabled(false)}
                      className="accent-[#FF6A00] w-4 h-4 cursor-pointer"
                    />
                    <span className="text-zinc-300 text-xs font-medium">Disable forwarding</span>
                  </label>

                  {/* Option 2: Forward a copy to */}
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="forwarding_toggle"
                        checked={isForwardingEnabled}
                        onChange={() => {
                          if (forwardingSettings.forwarding_addresses.length === 0) {
                            setForwardStep('input');
                          }
                          setIsForwardingEnabled(true);
                        }}
                        className="accent-[#FF6A00] w-4 h-4 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1 space-y-2 text-xs">
                        <span className="text-zinc-200 font-medium">
                          Forward a copy of incoming mail to:
                        </span>

                        {forwardingSettings.forwarding_addresses.filter(a => a.verified).length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <div>
                              <select
                                value={selectedForwardEmail}
                                onChange={(e) => setSelectedForwardEmail(e.target.value)}
                                disabled={!isForwardingEnabled}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-[#FF6A00] disabled:opacity-50"
                              >
                                {forwardingSettings.forwarding_addresses
                                  .filter(a => a.verified)
                                  .map(a => (
                                    <option key={a.email} value={a.email} className="bg-zinc-900 text-white">
                                      {a.email}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div>
                              <select
                                value={forwardAction}
                                onChange={(e) => setForwardAction(e.target.value as any)}
                                disabled={!isForwardingEnabled}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-[#FF6A00] disabled:opacity-50"
                              >
                                <option value="keep" className="bg-zinc-900 text-white">
                                  keep GoldMailer's copy in the Inbox
                                </option>
                                <option value="read" className="bg-zinc-900 text-white">
                                  mark GoldMailer's copy as read
                                </option>
                                <option value="archive" className="bg-zinc-900 text-white">
                                  archive GoldMailer's copy
                                </option>
                                <option value="delete" className="bg-zinc-900 text-white">
                                  delete GoldMailer's copy
                                </option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-1">
                            <p className="text-[11px] text-zinc-400">
                              No verified forwarding address added yet. Click &quot;Add a forwarding address&quot; below to configure one.
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleSaveForwarding}
                    disabled={isSavingForwardSettings}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
                  >
                    {isSavingForwardSettings ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>

                  {forwardStep === 'idle' && (
                    <button
                      type="button"
                      onClick={() => {
                        setForwardStep('input');
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      + Add a forwarding address
                    </button>
                  )}
                </div>
              </div>

              {/* Add Forwarding Address Wizard */}
              {forwardStep === 'input' && (
                <div className="p-4 bg-black/40 border border-[#FF6A00]/40 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CornerUpRight className="w-3.5 h-3.5 text-[#FF6A00]" />
                      <span>Add a forwarding address</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setForwardStep('idle')}
                      className="text-zinc-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  <form onSubmit={handleAddForwardAddress} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        Enter destination email address
                      </label>
                      <input
                        type="email"
                        value={newForwardEmail}
                        onChange={(e) => setNewForwardEmail(e.target.value)}
                        placeholder="recipient@gmail.com"
                        required
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isAddingForward || !newForwardEmail.trim()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white text-xs font-bold shadow hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                      >
                        {isAddingForward ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Sending code...</span>
                          </>
                        ) : (
                          <>
                            <span>Next &amp; Send Code</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setForwardStep('idle')}
                        className="px-3 py-2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Verify Forwarding Address Code */}
              {forwardStep === 'verify' && (
                <div className="p-4 bg-black/40 border border-amber-500/40 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Verify forwarding address</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setForwardStep('idle')}
                      className="text-zinc-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
                    A confirmation code was sent to <strong>{pendingForwardVerifyEmail}</strong>. Enter the 6-digit code below to confirm permission.
                  </div>
                  <form onSubmit={handleVerifyForwardCode} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                        6-Digit Confirmation Code
                      </label>
                      <input
                        type="text"
                        value={forwardCodeInput}
                        onChange={(e) => setForwardCodeInput(e.target.value)}
                        placeholder="123456"
                        required
                        maxLength={8}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isVerifyingForward || !forwardCodeInput.trim()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF6A00] text-white text-xs font-bold shadow hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                      >
                        {isVerifyingForward ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Verify Address</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setForwardStep('idle')}
                        className="px-3 py-2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Verified Addresses List */}
              <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>Configured Forwarding Addresses</span>
                </h4>

                {forwardingSettings.forwarding_addresses.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic py-2">
                    No forwarding addresses have been configured yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {forwardingSettings.forwarding_addresses.map(addr => (
                      <div
                        key={addr.email}
                        className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="w-4 h-4 text-[#FF8C42] flex-shrink-0" />
                          <div className="truncate">
                            <span className="font-mono text-xs text-white">{addr.email}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {addr.verified ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                  <Check className="w-3 h-3" />
                                  <span>Verified</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingForwardVerifyEmail(addr.email);
                                    if (addr.verification_code) {
                                      setForwardCodeInput(addr.verification_code);
                                    }
                                    setForwardStep('verify');
                                  }}
                                  className="text-[10px] text-amber-400 font-semibold underline hover:text-amber-300 cursor-pointer"
                                >
                                  Pending verification (click to verify)
                                </button>
                              )}
                              {selectedForwardEmail === addr.email && isForwardingEnabled && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FF6A00]/20 text-[#FF8C42] font-bold">
                                  Active Target
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {addr.verified && (
                            <button
                              type="button"
                              onClick={async () => {
                                setSelectedForwardEmail(addr.email);
                                setIsForwardingEnabled(true);
                                await updateForwardingSettings({
                                  enabled: true,
                                  forwarding_email: addr.email,
                                  action: forwardAction
                                });
                                await loadForwardingSettings();
                                setSuccessMsg(`Forwarding enabled to ${addr.email}`);
                              }}
                              title="Set as active forwarding destination"
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Use this address
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteForwardAddress(addr.email)}
                            title="Remove forwarding address"
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
