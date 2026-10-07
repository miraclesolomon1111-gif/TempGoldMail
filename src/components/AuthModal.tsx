import React, { useState, useRef } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Globe,
  MapPin,
  Calendar,
  Camera,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { COUNTRIES_LIST } from '../lib/emailGenerator';
import { registerUser, loginUser } from '../lib/api';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regAge, setRegAge] = useState('');
  const [regGender, setRegGender] = useState('Male');
  const [regCountry, setRegCountry] = useState('United States of America');
  const [regLocation, setRegLocation] = useState('');
  const [regAvatar, setRegAvatar] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setRegAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError('Please provide email and password');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const result = await loginUser(loginEmail.trim(), loginPassword.trim());
      onAuthSuccess(result.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regPassword.trim()) {
      setError('Please provide email and password');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const result = await registerUser({
        email: regEmail.trim(),
        password: regPassword.trim(),
        name: regName.trim() || undefined,
        age: regAge ? parseInt(regAge, 10) : undefined,
        gender: regGender,
        country: regCountry,
        location: regLocation.trim() || undefined,
        avatar_url: regAvatar || undefined
      });
      onAuthSuccess(result.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e1f20] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 z-10 border border-[#303134] animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#303134]">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-white">
              {mode === 'login' ? 'Sign in to GoldMail' : 'Create GoldMail Account'}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#c4c7c5] hover:text-white rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-2xl bg-[#121212] p-1 border border-[#303134] mt-4">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-medium rounded-xl transition-all ${
              mode === 'login' ? 'bg-[#2d2f31] text-white shadow-sm' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-medium rounded-xl transition-all ${
              mode === 'register' ? 'bg-[#2d2f31] text-white shadow-sm' : 'text-[#8e918f] hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'login' ? (
          /* Login Form */
          <form onSubmit={handleLogin} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Email</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3.5 py-2.5">
                <Mail className="w-4 h-4 text-[#8e918f] mr-2 flex-shrink-0" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full bg-transparent text-white text-xs outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Password</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3.5 py-2.5">
                <Lock className="w-4 h-4 text-[#8e918f] mr-2 flex-shrink-0" />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-transparent text-white text-xs outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-2xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50"
            >
              <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          /* Registration Form with Profile fields */
          <form onSubmit={handleRegister} className="mt-4 space-y-3">
            {/* Avatar upload */}
            <div className="flex items-center gap-3">
              {regAvatar ? (
                <img
                  src={regAvatar}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full object-cover border border-[#8ab4f8]"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#121212] border border-[#303134] flex items-center justify-center text-[#8e918f]">
                  <Camera className="w-5 h-5" />
                </div>
              )}
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 rounded-xl bg-[#2d2f31] hover:bg-[#3c4043] text-xs text-white"
                >
                  Upload Profile Picture
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFile}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Full Name</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3.5 py-2">
                <User className="w-4 h-4 text-[#8e918f] mr-2" />
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Solomon Miracle"
                  className="w-full bg-transparent text-white text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Email</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3.5 py-2">
                <Mail className="w-4 h-4 text-[#8e918f] mr-2" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-transparent text-white text-xs outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Password</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] focus-within:border-[#8ab4f8] px-3.5 py-2">
                <Lock className="w-4 h-4 text-[#8e918f] mr-2" />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Secure password"
                  className="w-full bg-transparent text-white text-xs outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#8e918f] mb-1">Age</label>
                <input
                  type="number"
                  value={regAge}
                  onChange={(e) => setRegAge(e.target.value)}
                  placeholder="Age"
                  min="13"
                  max="120"
                  className="w-full bg-[#121212] border border-[#303134] rounded-xl px-3 py-2 text-white text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8e918f] mb-1">Gender</label>
                <select
                  value={regGender}
                  onChange={(e) => setRegGender(e.target.value)}
                  className="w-full bg-[#121212] border border-[#303134] rounded-xl px-3 py-2 text-white text-xs outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Country (250 Countries)</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3 py-2">
                <Globe className="w-4 h-4 text-[#8e918f] mr-2 flex-shrink-0" />
                <select
                  value={regCountry}
                  onChange={(e) => setRegCountry(e.target.value)}
                  className="w-full bg-transparent text-white text-xs outline-none"
                >
                  {COUNTRIES_LIST.map((country) => (
                    <option key={country} value={country} className="bg-[#1e1f20] text-white">
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8e918f] mb-1">Location / City</label>
              <div className="flex items-center rounded-xl bg-[#121212] border border-[#303134] px-3.5 py-2">
                <MapPin className="w-4 h-4 text-[#8e918f] mr-2" />
                <input
                  type="text"
                  value={regLocation}
                  onChange={(e) => setRegLocation(e.target.value)}
                  placeholder="City, State"
                  className="w-full bg-transparent text-white text-xs outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-2xl bg-[#0b57d0] hover:bg-[#1a73e8] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50"
            >
              <span>{isLoading ? 'Creating account...' : 'Create Account'}</span>
              <Check className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
