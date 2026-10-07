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
  Laptop
} from 'lucide-react';
import QRCode from 'qrcode';
import { UserProfile, UserDevice } from '../types';
import {
  setup2FA,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
  fetchUserDevices,
  revokeAllOtherDevices,
  updateUserProfile
} from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  user: UserProfile | null;
  onUserUpdated: (u: UserProfile) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeEmail,
  user,
  onUserUpdated,
  darkMode,
  onToggleDarkMode
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'devices'>('security');

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user?.two_factor_enabled));
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>(user?.backup_codes || []);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState(user?.phone || user?.recovery_phone || '');
  const [backupEmail, setBackupEmail] = useState(user?.backup_email || '');

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
      setRecoveryPhone(user.phone || user.recovery_phone || '');
      setBackupEmail(user.backup_email || '');
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen]);

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const list = await fetchUserDevices();
      setDevices(list);
    } finally {
      setIsLoadingDevices(false);
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
      const res = await enable2FA(verifyCode.trim());
      setTwoFactorEnabled(true);
      setBackupCodes(res.backup_codes);
      setIsSettingUp2FA(false);
      setSuccessMsg('2-Step Verification is now enabled on your account!');
      if (user) {
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
      await disable2FA();
      setTwoFactorEnabled(false);
      setSuccessMsg('2-Step Verification has been disabled.');
      if (user) {
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
      if (user) {
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

  // Save Recovery Contacts
  const handleSaveRecovery = async () => {
    setIsLoading(true);
    try {
      const updated = await updateUserProfile({
        recovery_phone: recoveryPhone.trim(),
        backup_email: backupEmail.trim()
      });
      onUserUpdated(updated);
      setSuccessMsg('Recovery details saved.');
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
                      placeholder="+234 801 234 5678"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] mb-1">Backup Email Address</label>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      placeholder="backup@gmail.com"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#FF6A00]"
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

          {/* TAB 2: DEVICES */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Your Logged-in Devices</h4>
                  <p className="text-xs text-zinc-400">
                    Sessions currently active on your GoldMailer account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeOtherDevices}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold text-xs flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out of all other devices
                </button>
              </div>

              <div className="space-y-2">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      d.is_current
                        ? 'bg-[#FF6A00]/10 border-[#FF6A00]/40'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-[#FF8C42]">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{d.device_name}</span>
                          {d.is_current && (
                            <span className="text-[10px] bg-[#FF6A00] text-white px-1.5 py-0.2 rounded-full font-bold">
                              Current Device
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          {d.location} · IP: {d.ip} · Last active: {d.is_current ? 'Now' : new Date(d.last_active).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
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
                  <span className="text-zinc-400 font-mono">0.42 GB of 15.00 GB (2.8%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] rounded-full" style={{ width: '2.8%' }} />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Permanent 15GB complimentary cloud storage included with every GoldMailer account.
                </p>
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
        </div>
      </div>
    </div>
  );
};
