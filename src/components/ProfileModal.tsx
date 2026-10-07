import React, { useState, useRef } from 'react';
import {
  X,
  User,
  Globe,
  MapPin,
  Calendar,
  Camera,
  Check,
  ShieldCheck,
  Sparkles,
  Lock,
  Mail,
  Trash2
} from 'lucide-react';
import { UserProfile, TempEmail } from '../types';
import { COUNTRIES_LIST } from '../lib/emailGenerator';
import { updateUserProfile } from '../lib/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  createdEmails: TempEmail[];
  onUpdateUser: (updated: UserProfile) => void;
  onDeleteEmail: (id: string, email: string) => void;
  onOpenReserve: (email: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  createdEmails,
  onUpdateUser,
  onDeleteEmail,
  onOpenReserve
}) => {
  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [gender, setGender] = useState(user?.gender || 'Prefer not to say');
  const [country, setCountry] = useState(user?.country || 'United States of America');
  const [location, setLocation] = useState(user?.location || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAvatarUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await updateUserProfile({
        name: name.trim() || undefined,
        age: age ? parseInt(age, 10) : undefined,
        gender,
        country,
        location: location.trim() || undefined,
        avatar_url: avatarUrl || undefined
      });
      onUpdateUser(updated);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <h2 className="text-base font-medium text-white">GoldMail Profile & Accounts</h2>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Avatar edit */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-full object-cover border-2 border-[#8ab4f8]"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#0b57d0] text-white flex items-center justify-center text-xl font-bold">
                  {(name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-1.5 bg-[#2d2f31] hover:bg-[#3c4043] text-white rounded-full border border-white/20 shadow"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFile}
                className="hidden"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-white">{name || user?.name || 'GoldMail User'}</p>
              <p className="text-xs text-[#8e918f] font-mono">{user?.email || 'Guest Session'}</p>
              {user?.isPremium && (
                <span className="inline-block mt-1 text-[10px] bg-amber-500/20 text-[#fbbc04] font-semibold px-2 py-0.5 rounded-full">
                  PREMIUM SUBSCRIBER
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Full Name</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2">
                <User className="w-3.5 h-3.5 text-[#8e918f] mr-2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-transparent text-white text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
                min="13"
                max="120"
                className="w-full bg-[#121212] border border-[#303134] rounded-xl px-3 py-2 text-white text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-[#121212] border border-[#303134] rounded-xl px-3 py-2 text-white text-xs outline-none"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Location / City</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-[#8e918f] mr-2" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Region"
                  className="w-full bg-transparent text-white text-xs outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8e918f] mb-1">Country (250 Countries)</label>
            <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2">
              <Globe className="w-3.5 h-3.5 text-[#8e918f] mr-2 flex-shrink-0" />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-transparent text-white text-xs outline-none"
              >
                {COUNTRIES_LIST.map((c) => (
                  <option key={c} value={c} className="bg-[#1e1f20] text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : null}
            <span>{isSaving ? 'Saving...' : isSaved ? 'Profile Saved!' : 'Save Profile Changes'}</span>
          </button>
        </form>

        {/* Managed Custom Emails Table */}
        <div className="mt-6 pt-5 border-t border-[#303134]">
          <h3 className="text-xs font-semibold text-[#8e918f] uppercase tracking-wider mb-3">
            Managed Custom Emails ({createdEmails.length})
          </h3>

          {createdEmails.length === 0 ? (
            <p className="text-xs text-[#8e918f] text-center py-4 bg-[#121212] rounded-xl border border-[#303134]">
              No custom addresses created yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {createdEmails.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#121212] border border-[#303134]"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-white truncate font-mono">
                        {item.email_address}
                      </p>
                      {item.is_reserved ? (
                        <span className="text-[10px] bg-amber-500/20 text-[#fbbc04] px-1.5 py-0.2 rounded font-semibold">
                          RESERVED ($1.11)
                        </span>
                      ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded">
                          TEMP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8e918f]">
                      Created {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!item.is_reserved && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenReserve(item.email_address);
                        }}
                        className="px-2 py-1 rounded bg-[#fbbc04]/10 hover:bg-[#fbbc04]/20 text-[#fbbc04] text-[10px] font-semibold transition-colors"
                      >
                        Reserve $1.11
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${item.email_address}?`)) {
                          onDeleteEmail(item.id, item.email_address);
                        }
                      }}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-colors"
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
    </div>
  );
};
