import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  HardDrive,
  Trash2,
  Ban,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Search,
  Code2,
  Phone,
  Radio,
  Zap,
  Eye,
  EyeOff,
  Check,
  Send,
  Sparkles,
  Smartphone
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  toggleBanUser,
  deleteAdminUser,
  fetchAdminTwilioStatus,
  updateAdminTwilioConfig,
  testAdminTwilioConnection
} from '../lib/api';
import { UserProfile } from '../types';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'twilio'>('users');
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Twilio Settings State
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioTrialNumber, setTwilioTrialNumber] = useState('+17372508034');
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [isTwilioConfigured, setIsTwilioConfigured] = useState(false);
  const [isTestingTwilio, setIsTestingTwilio] = useState(false);
  const [isSavingTwilio, setIsSavingTwilio] = useState(false);
  const [twilioTestResult, setTwilioTestResult] = useState<any>(null);
  const [twilioNotice, setTwilioNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadTwilioStatus();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ov, us] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers()
      ]);
      setOverview(ov);
      setUsers(us);
      if (ov.adminPhoneNumber) {
        setTwilioTrialNumber(ov.adminPhoneNumber);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin telemetry');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTwilioStatus = async () => {
    try {
      const status = await fetchAdminTwilioStatus();
      setIsTwilioConfigured(status.isConfigured);
      if (status.trialNumber) setTwilioTrialNumber(status.trialNumber);
    } catch (e) {
      console.warn('Twilio status note:', e);
    }
  };

  const handleSaveTwilio = async () => {
    setIsSavingTwilio(true);
    setTwilioNotice(null);
    try {
      const res = await updateAdminTwilioConfig({
        accountSid: twilioAccountSid.trim() || undefined,
        authToken: twilioAuthToken.trim() || undefined,
        trialNumber: twilioTrialNumber.trim() || undefined
      });
      setIsTwilioConfigured(res.isConfigured);
      setTwilioNotice('Twilio credentials saved successfully.');
      loadData();
    } catch (err: any) {
      setTwilioNotice(`Error: ${err.message || 'Failed to save Twilio settings'}`);
    } finally {
      setIsSavingTwilio(false);
    }
  };

  const handleTestTwilio = async () => {
    setIsTestingTwilio(true);
    setTwilioTestResult(null);
    setTwilioNotice(null);
    try {
      const res = await testAdminTwilioConnection({
        accountSid: twilioAccountSid.trim() || undefined,
        authToken: twilioAuthToken.trim() || undefined,
        trialNumber: twilioTrialNumber.trim() || undefined
      });
      setTwilioTestResult(res);
      if (res.success) {
        setIsTwilioConfigured(true);
        if (res.trialNumbers && res.trialNumbers.length > 0) {
          setTwilioTrialNumber(res.trialNumbers[0].phoneNumber);
        }
        loadData();
      }
    } catch (err: any) {
      setTwilioTestResult({
        success: false,
        error: err.message || 'Twilio connection test failed.'
      });
    } finally {
      setIsTestingTwilio(false);
    }
  };

  const handleToggleBan = async (userId: string) => {
    try {
      await toggleBanUser(userId);
      setUsers(users.map((u) => (u.id === userId ? { ...u, is_banned: !u.is_banned } : u)));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this account?')) return;
    try {
      await deleteAdminUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl bg-[#18191c]/95 border-2 border-[#FF6A00]/30 text-white rounded-3xl shadow-2xl p-5 sm:p-7 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-white shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>GoldMailer System Administration</span>
                <span className="text-[10px] bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/40 px-2 py-0.5 rounded-full font-bold">
                  /admin
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                User Directory · 15GB Cloud Storage · Twilio Free Trial Gateway
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users Directory ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('twilio')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'twilio'
                ? 'bg-gradient-to-r from-red-600 to-[#FF6A00] text-white shadow-md shadow-red-500/20'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Twilio Free Trial Gateway</span>
            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full font-mono">
              Admin Only
            </span>
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Overview Stats Cards */}
        {overview && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2.5 flex-shrink-0">
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#FF6A00]" /> Total Users
              </span>
              <p className="text-lg font-bold text-white mt-1">{overview.totalUsers}</p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#FF8C42]" /> Total Storage
              </span>
              <p className="text-lg font-bold text-white mt-1">{overview.totalStorageUsedMb} MB</p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" /> Admin Line
              </span>
              <p className="text-xs font-mono font-bold text-emerald-400 mt-1 truncate" title={overview.adminPhoneNumber}>
                {overview.adminPhoneNumber}
              </p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-blue-400" /> Twilio Trial
              </span>
              <p className="text-xs font-bold text-emerald-400 mt-1">
                {overview.isTwilioConfigured ? 'Live Connected' : 'Configured'}
              </p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-400" /> OAuth Apps
              </span>
              <p className="text-lg font-bold text-white mt-1">{overview.totalOAuthClients || 0}</p>
            </div>
          </div>
        )}

        {/* TAB 1: USERS DIRECTORY */}
        {activeTab === 'users' && (
          <div className="flex-1 flex flex-col min-h-0 mt-3 overflow-hidden">
            {/* Search bar */}
            <div className="flex items-center justify-between gap-3 flex-shrink-0 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users by name, username, or email..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                />
              </div>
              <button
                onClick={loadData}
                disabled={isLoading}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-300"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* User table */}
            <div className="flex-1 overflow-y-auto border border-white/10 rounded-2xl bg-black/30">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-white/5 text-zinc-400 font-semibold border-b border-white/10 sticky top-0">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">2FA</th>
                    <th className="p-3">Storage Quota</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <p className="font-semibold text-white">
                          {u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.name || 'User'}
                        </p>
                        <p className="text-[11px] text-[#FF8C42] font-mono">{u.email}</p>
                      </td>
                      <td className="p-3 font-mono text-zinc-400">@{u.username}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.two_factor_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {u.two_factor_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-zinc-300">
                        {((u.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1)} MB / 15 GB
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.is_banned ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {u.is_banned ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleBan(u.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            u.is_banned
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          }`}
                        >
                          {u.is_banned ? 'Unban' : 'Ban'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[11px] font-semibold transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TWILIO FREE TRIAL GATEWAY */}
        {activeTab === 'twilio' && (
          <div className="flex-1 flex flex-col min-h-0 mt-3 overflow-y-auto space-y-4 pr-1">
            {/* Twilio Banner Matching Twilio Console (Ahoy, Miracle) */}
            <div className="p-4 bg-gradient-to-r from-red-950/40 via-[#1c1d22] to-amber-950/30 border border-red-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">Ahoy, Miracle (Twilio Free Trial)</span>
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                    Trial · 30 Days Active
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Strictly reserved for Admin Line. Calls and SMS utilize your real Twilio free trial balance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestTwilio}
                  disabled={isTestingTwilio}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTwilio ? 'animate-spin' : ''}`} />
                  <span>{isTestingTwilio ? 'Testing Twilio...' : 'Run Test & Sync Numbers'}</span>
                </button>
              </div>
            </div>

            {/* Free Trial Units Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
                <span className="text-[11px] text-zinc-400">Send an SMS</span>
                <p className="text-lg font-bold text-white mt-1">100 Free SMS</p>
                <span className="text-[10px] text-emerald-400">Included in trial</span>
              </div>
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
                <span className="text-[11px] text-zinc-400">Make a voice call</span>
                <p className="text-lg font-bold text-white mt-1">75 Free Mins</p>
                <span className="text-[10px] text-emerald-400">Direct outbound</span>
              </div>
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
                <span className="text-[11px] text-zinc-400">Admin Carrier Line</span>
                <p className="text-xs font-mono font-bold text-emerald-400 mt-2 truncate">
                  {twilioTrialNumber || '+1 (737) 250-8034'}
                </p>
                <span className="text-[10px] text-zinc-400">Real Twilio trial number</span>
              </div>
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
                <span className="text-[11px] text-zinc-400">Send an email</span>
                <p className="text-lg font-bold text-white mt-1">3,000 Emails</p>
                <span className="text-[10px] text-emerald-400">SendGrid / Resend API</span>
              </div>
            </div>

            {/* Twilio Credentials Configuration Form */}
            <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#FF6A00]" />
                <span>Twilio Live Credentials Configuration</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Account SID */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-medium">Twilio Account SID</label>
                  <input
                    type="text"
                    value={twilioAccountSid}
                    onChange={(e) => setTwilioAccountSid(e.target.value)}
                    placeholder="e.g. AC0cfee0a16ee... (from Twilio console)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                  />
                  <span className="text-[10px] text-zinc-500">Starts with AC (shown in your Twilio console screenshot)</span>
                </div>

                {/* Auth Token */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-medium">Twilio Auth Token</label>
                  <div className="relative">
                    <input
                      type={showAuthToken ? 'text' : 'password'}
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      placeholder="Auth token from Twilio console"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-9 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                      className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                    >
                      {showAuthToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-zinc-500">Found below Account SID in Twilio Console</span>
                </div>

                {/* Trial Phone Number */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-medium">Admin Twilio Trial Phone Number</label>
                  <input
                    type="text"
                    value={twilioTrialNumber}
                    onChange={(e) => setTwilioTrialNumber(e.target.value)}
                    placeholder="+17372508034"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                  />
                  <span className="text-[10px] text-zinc-500">Your assigned Twilio trial number in E.164 format</span>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveTwilio}
                    disabled={isSavingTwilio}
                    className="w-full px-4 py-2 bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 h-[38px]"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingTwilio ? 'Saving...' : 'Save Twilio Configuration'}</span>
                  </button>
                </div>
              </div>

              {twilioNotice && (
                <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  twilioNotice.startsWith('Error')
                    ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                }`}>
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{twilioNotice}</span>
                </div>
              )}
            </div>

            {/* Diagnostic Test Output Panel */}
            {twilioTestResult && (
              <div className={`p-4 rounded-2xl border ${
                twilioTestResult.success
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-950/20 border-red-500/30 text-red-300'
              } space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    {twilioTestResult.success ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                    <span>Twilio Live Diagnostic Test Result</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10">
                    {twilioTestResult.success ? 'TEST PASSED' : 'TEST FAILED'}
                  </span>
                </div>

                {twilioTestResult.message && (
                  <p className="text-xs text-zinc-300">{twilioTestResult.message}</p>
                )}

                {twilioTestResult.error && (
                  <p className="text-xs text-red-400 font-mono">{twilioTestResult.error}</p>
                )}

                {twilioTestResult.account && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                    <div className="p-2 bg-black/30 rounded-lg">
                      <span className="text-zinc-500 block">Account:</span>
                      <span className="text-white font-bold">{twilioTestResult.account.friendlyName || twilioTestResult.account.sid}</span>
                    </div>
                    <div className="p-2 bg-black/30 rounded-lg">
                      <span className="text-zinc-500 block">Type:</span>
                      <span className="text-white font-bold">{twilioTestResult.account.type}</span>
                    </div>
                    <div className="p-2 bg-black/30 rounded-lg">
                      <span className="text-zinc-500 block">Status:</span>
                      <span className="text-white font-bold">{twilioTestResult.account.status}</span>
                    </div>
                    <div className="p-2 bg-black/30 rounded-lg">
                      <span className="text-zinc-500 block">Live Numbers:</span>
                      <span className="text-emerald-400 font-bold">{twilioTestResult.trialNumbers?.length || 0} active</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

