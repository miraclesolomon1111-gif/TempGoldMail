import React, { useState } from 'react';
import { X, Settings, Bell, Globe, Shield, RefreshCw, Key, ExternalLink } from 'lucide-react';
import { PRIMARY_DOMAIN } from '../lib/emailGenerator';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, activeEmail }) => {
  const [notifications, setNotifications] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134]">
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#8ab4f8]" />
            <h2 className="text-base font-medium text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {/* Active Email details */}
          <div className="p-3.5 bg-[#121212] border border-[#303134] rounded-2xl">
            <p className="text-[#8e918f] mb-1">Active Mailbox</p>
            <p className="font-mono text-white text-sm truncate">{activeEmail || 'None selected'}</p>
            <p className="text-[#8ab4f8] mt-1 font-mono text-[11px]">Primary Domain: {PRIMARY_DOMAIN}</p>
          </div>

          {/* Preferences */}
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121212] border border-[#303134] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-[#8ab4f8]" />
                <div>
                  <span className="font-medium text-white">Browser Notifications</span>
                  <p className="text-[#8e918f] text-[11px]">Notify when new email arrives</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="w-4 h-4 accent-[#0b57d0]"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121212] border border-[#303134] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-[#8ab4f8]" />
                <div>
                  <span className="font-medium text-white">Live Inbound Sync</span>
                  <p className="text-[#8e918f] text-[11px]">Sync incoming webhooks every 4s</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 accent-[#0b57d0]"
              />
            </label>
          </div>

          {/* Webhook & Routing Status */}
          <div className="p-3.5 bg-[#121212] border border-[#303134] rounded-2xl space-y-1.5 text-[11px] text-[#8e918f]">
            <div className="flex items-center justify-between text-white font-medium text-xs">
              <span>Catch-All Routing</span>
              <span className="text-emerald-400 font-semibold">Active &bull; Connected</span>
            </div>
            <p>Cloudflare Email Routing catch-all worker forwards *@goldmailer.xyz to /api/inbound.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
