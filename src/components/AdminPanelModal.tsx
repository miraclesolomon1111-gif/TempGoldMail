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
  Phone
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  toggleBanUser,
  deleteAdminUser
} from '../lib/api';
import { UserProfile } from '../types';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
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
      const [ov, us] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers()
      ]);
      setOverview(ov);
      setUsers(us);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin telemetry');
    } finally {
      setIsLoading(false);
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
      <div className="relative w-full max-w-4xl bg-[#18191c]/95 border-2 border-[#FF6A00]/30 text-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
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
                User Directory · 15GB Cloud Storage Governance · Access Control
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Overview Stats Cards */}
        {overview && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 flex-shrink-0">
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#FF6A00]" /> Total Users
              </span>
              <p className="text-xl font-bold text-white mt-1">{overview.totalUsers}</p>
            </div>
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#FF8C42]" /> Total Storage
              </span>
              <p className="text-xl font-bold text-white mt-1">{overview.totalStorageUsedMb} MB</p>
            </div>
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" /> Admin Phone Line
              </span>
              <p className="text-xs font-mono font-bold text-emerald-400 mt-2 truncate" title={overview.adminPhoneNumber || '+1 (737) 250-8034'}>
                {overview.adminPhoneNumber || '+1 (737) 250-8034'}
              </p>
            </div>
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Blocked IPs
              </span>
              <p className="text-xl font-bold text-white mt-1">{overview.blockedIpsCount || 0}</p>
            </div>
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-400" /> OAuth Apps
              </span>
              <p className="text-xl font-bold text-white mt-1">{overview.totalOAuthClients || 0}</p>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="mt-4 flex items-center justify-between gap-3 flex-shrink-0">
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
        <div className="mt-4 flex-1 overflow-y-auto border border-white/10 rounded-2xl bg-black/30">
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
    </div>
  );
};
