import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  Mail,
  CreditCard,
  HardDrive,
  Trash2,
  Ban,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Search,
  ExternalLink
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminEmails,
  fetchAdminPayments,
  toggleAdminUserBan,
  toggleAdminUserPremium,
  deleteAdminUser,
  deleteAdminEmail
} from '../lib/api';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'emails' | 'payments'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ov, us, em, pm] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminEmails(),
        fetchAdminPayments()
      ]);
      setOverview(ov);
      setUsers(us);
      setEmails(em);
      setPayments(pm);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin telemetry');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBan = async (userId: string) => {
    try {
      await toggleAdminUserBan(userId);
      setUsers(users.map(u => u.id === userId ? { ...u, is_banned: !u.is_banned } : u));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleTogglePremium = async (userId: string) => {
    try {
      await toggleAdminUserPremium(userId);
      setUsers(users.map(u => u.id === userId ? { ...u, isPremium: !u.isPremium } : u));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Permanently delete this user and all associated records?')) return;
    try {
      await deleteAdminUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteEmail = async (id: string) => {
    if (!confirm('Permanently delete this email address?')) return;
    try {
      await deleteAdminEmail(id);
      setEmails(emails.filter(e => e.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#303134]">
          <div className="flex items-center gap-2 text-[#fbbc04]">
            <ShieldCheck className="w-6 h-6" />
            <div>
              <h2 className="text-base font-semibold text-white">GoldMail Admin Control Panel</h2>
              <p className="text-xs text-[#8e918f]">goldmailer.xyz platform administration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-1.5 text-[#c4c7c5] hover:text-white rounded-lg hover:bg-white/10"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="my-3 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#303134] pt-3 pb-2 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
              activeTab === 'overview' ? 'bg-[#333d4d] text-[#c2e7ff]' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
              activeTab === 'users' ? 'bg-[#333d4d] text-[#c2e7ff]' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
              activeTab === 'emails' ? 'bg-[#333d4d] text-[#c2e7ff]' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            Custom Mailboxes ({emails.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
              activeTab === 'payments' ? 'bg-[#333d4d] text-[#c2e7ff]' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            NOWPayments (${overview?.revenue || '0.00'})
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {activeTab === 'overview' && overview && (
            <div className="space-y-4">
              {/* Telemetry Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#121212] border border-[#303134] p-4 rounded-2xl">
                  <div className="text-xs text-[#8e918f]">Total Users</div>
                  <div className="text-xl font-bold text-white mt-1">{overview.totalUsers}</div>
                </div>
                <div className="bg-[#121212] border border-[#303134] p-4 rounded-2xl">
                  <div className="text-xs text-[#8e918f]">Custom Mailboxes</div>
                  <div className="text-xl font-bold text-[#8ab4f8] mt-1">{overview.totalCustomEmails}</div>
                </div>
                <div className="bg-[#121212] border border-[#303134] p-4 rounded-2xl">
                  <div className="text-xs text-[#8e918f]">Emails Ingested</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{overview.totalEmailsReceived}</div>
                </div>
                <div className="bg-[#121212] border border-[#303134] p-4 rounded-2xl">
                  <div className="text-xs text-[#8e918f]">Crypto Revenue</div>
                  <div className="text-xl font-bold text-[#fbbc04] mt-1">${overview.revenue}</div>
                </div>
              </div>

              {/* Storage Breakdown Widget (Screenshot 5) */}
              <div className="bg-[#121212] border border-[#303134] p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">System Storage Utilization</span>
                  <span className="text-[#8ab4f8] font-mono font-medium">
                    {overview.storage?.percentage}% of {overview.storage?.totalFormatted} used ({overview.storage?.usedFormatted})
                  </span>
                </div>
                <div className="h-2 w-full bg-[#303134] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8ab4f8] rounded-full transition-all duration-500"
                    style={{ width: `${overview.storage?.percentage}%` }}
                  />
                </div>
              </div>

              {/* Live Webhook / Resend logs */}
              {overview.recentAuditLogs?.length > 0 && (
                <div className="bg-[#121212] border border-[#303134] p-4 rounded-2xl">
                  <h3 className="text-xs font-semibold text-[#8e918f] uppercase tracking-wider mb-2">
                    Recent Webhook & Resend Operations
                  </h3>
                  <div className="space-y-1.5 text-xs font-mono max-h-48 overflow-y-auto">
                    {overview.recentAuditLogs.map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between p-2 rounded bg-[#1e1f20] border border-white/5">
                        <span className="text-[#8ab4f8] truncate max-w-[200px]">{log.to}</span>
                        <span className="text-zinc-400 truncate max-w-[200px]">{log.subject}</span>
                        <span className="text-emerald-400 text-[10px] uppercase font-bold">{log.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#c4c7c5]">
                  <thead className="bg-[#121212] text-[#8e918f] uppercase font-semibold">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Country</th>
                      <th className="p-3">Addresses</th>
                      <th className="p-3">Premium</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303134]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/5">
                        <td className="p-3">
                          <div className="font-medium text-white">{u.name || 'Unnamed'}</div>
                          <div className="font-mono text-[11px] text-[#8e918f]">{u.email}</div>
                        </td>
                        <td className="p-3">{u.country || 'N/A'}</td>
                        <td className="p-3">{u.addressCount || 0}</td>
                        <td className="p-3">
                          {u.isPremium ? (
                            <span className="bg-amber-500/20 text-[#fbbc04] px-1.5 py-0.5 rounded font-bold text-[10px]">
                              PRO
                            </span>
                          ) : (
                            <span className="text-zinc-500">Free</span>
                          )}
                        </td>
                        <td className="p-3">
                          {u.is_banned ? (
                            <span className="text-red-400 font-bold">Banned</span>
                          ) : (
                            <span className="text-emerald-400">Active</span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <button
                            onClick={() => handleToggleBan(u.id)}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                          >
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                          <button
                            onClick={() => handleTogglePremium(u.id)}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-[#fbbc04]"
                          >
                            Toggle Pro
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#c4c7c5]">
                <thead className="bg-[#121212] text-[#8e918f] uppercase font-semibold">
                  <tr>
                    <th className="p-3">Email Handle</th>
                    <th className="p-3">Owner</th>
                    <th className="p-3">Reserved</th>
                    <th className="p-3">Protected</th>
                    <th className="p-3">Messages</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#303134]">
                  {emails.map((e) => (
                    <tr key={e.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono font-medium text-white">{e.email_address}</td>
                      <td className="p-3 text-[#8e918f]">{e.owner_email}</td>
                      <td className="p-3">
                        {e.is_reserved ? (
                          <span className="text-[#fbbc04] font-bold">$1.11 Forever</span>
                        ) : (
                          <span className="text-zinc-500">Free Temp</span>
                        )}
                      </td>
                      <td className="p-3">{e.is_password_protected ? 'Yes (Password)' : 'No'}</td>
                      <td className="p-3">{e.message_count || 0}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteEmail(e.id)}
                          className="p-1 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#c4c7c5]">
                <thead className="bg-[#121212] text-[#8e918f] uppercase font-semibold">
                  <tr>
                    <th className="p-3">Invoice ID</th>
                    <th className="p-3">Reserved Handle</th>
                    <th className="p-3">Crypto Amount</th>
                    <th className="p-3">USD Price</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#303134]">
                  {payments.map((p) => (
                    <tr key={p.payment_id} className="hover:bg-white/5 font-mono">
                      <td className="p-3 text-white">{p.payment_id}</td>
                      <td className="p-3 text-[#8ab4f8]">{p.email_to_reserve || 'N/A'}</td>
                      <td className="p-3">{p.pay_amount} {p.pay_currency}</td>
                      <td className="p-3 font-bold text-[#fbbc04]">${p.price_amount}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          p.payment_status === 'finished' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-[#fbbc04]'
                        }`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="p-3 text-[#8e918f]">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
