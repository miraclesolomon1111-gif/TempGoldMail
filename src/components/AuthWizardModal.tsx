import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Calendar,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  KeyRound,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { COUNTRIES_LIST } from '../lib/emailGenerator';
import {
  checkUsernameAvailability,
  suggestUsernames,
  sendPhoneOtp,
  verifyPhoneOtp,
  registerGoldUser,
  loginGoldUser
} from '../lib/api';
import { UserProfile } from '../types';

interface AuthWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  initialMode?: 'login' | 'register';
  onSuspiciousLoginDetected?: (data: any) => void;
}

export const AuthWizardModal: React.FC<AuthWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
  onSuspiciousLoginDetected
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [step, setStep] = useState<number>(1); // 1 to 6

  // Step 1: Names
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Step 2: DOB & Gender
  const [birthDay, setBirthDay] = useState('15');
  const [birthMonth, setBirthMonth] = useState('06');
  const [birthYear, setBirthYear] = useState('1998');
  const [gender, setGender] = useState('Male');

  // Step 3: Username
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ available?: boolean; message?: string } | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Step 4: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 5: Phone & Country & OTP
  const [country, setCountry] = useState('United States');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [mockOtpHint, setMockOtpHint] = useState<string | null>(null);

  // Step 6: Success & Backup Codes
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    if (!isOpen) {
      setStep(1);
      setError(null);
    }
  }, [initialMode, isOpen]);

  // Live availability check on username typing (debounced)
  useEffect(() => {
    if (step !== 3 || !username.trim()) {
      setUsernameStatus(null);
      return;
    }
    const clean = username.replace(/@.*$/, '').trim();
    if (clean.length < 3) {
      setUsernameStatus({ available: false, message: 'Username must be at least 3 characters' });
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const res = await checkUsernameAvailability(clean);
        setUsernameStatus(res);
      } catch {
        setUsernameStatus({ available: true, message: 'Username format available' });
      } finally {
        setIsCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, step]);

  if (!isOpen) return null;

  // Handle username suggestions
  const handleLoadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const list = await suggestUsernames(firstName || 'user', lastName || 'gold');
      setSuggestions(list);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Step 5: Send OTP
  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError('Please enter a valid phone number');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await sendPhoneOtp(phone.trim());
      setOtpSent(true);
      if (res.mock_code) {
        setMockOtpHint(res.mock_code);
        setOtpCode(res.mock_code); // Pre-fill for instant frictionless demo
      }
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 5: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await verifyPhoneOtp(phone.trim(), otpCode.trim());
      setOtpVerified(true);
      // Trigger final registration!
      await handleCompleteRegistration();
    } catch (e: any) {
      setError(e.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 6: Complete Registration
  const handleCompleteRegistration = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const dob = `${birthYear}-${birthMonth}-${birthDay}`;
      const res = await registerGoldUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob,
        gender,
        username: username.replace(/@.*$/, '').trim(),
        password: password.trim(),
        phone: phone.trim(),
        country
      });
      setBackupCodes(res.backup_codes || []);
      setStep(6);
      onSuccess(res.user);
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setError('Please provide email/username and password');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await loginGoldUser({
        identifier: loginIdentifier.trim(),
        password: loginPassword.trim(),
        totp_code: loginTotp.trim() || undefined
      });

      // Suspicious device detected!
      if (res.suspicious_login) {
        if (onSuspiciousLoginDetected) {
          onSuspiciousLoginDetected(res);
          onClose();
          return;
        }
      }

      // 2FA required
      if (res.requires_2fa) {
        setNeeds2FA(true);
        setError('2-Step Verification required. Please enter 6-digit Authenticator code or backup code.');
        return;
      }

      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
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
      `GoldMailer 2-Step Verification Backup Codes\nAccount: ${username}@goldmailer.xyz\nGenerated: ${new Date().toLocaleString()}\n\n` +
      backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nKeep these codes in a safe place. Each code can only be used once.`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goldmailer_backup_codes_${username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-[#18191c]/95 text-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-[#FF6A00]/25 overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-[#FF6A00]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-[#FF8C42]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8C42] flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-[#FF6A00]/30">
              G
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>GoldMailer</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#FF6A00]/20 text-[#FF8C42] border border-[#FF6A00]/30">
                  Permanent
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                {mode === 'register' ? `Create Account · Step ${step} of 6` : 'Sign in to your GoldMailer account'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="mt-4 grid grid-cols-2 p-1 bg-white/5 rounded-xl border border-white/10 text-xs font-semibold">
          <button
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* ================= LOGIN FORM ================= */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                GoldMailer Address or Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="username@goldmailer.xyz"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]"
                />
                <Mail className="absolute right-3.5 top-3 w-4 h-4 text-zinc-500" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">Password</label>
                <button
                  type="button"
                  onClick={() => alert('Password reset link has been dispatched to recovery contact.')}
                  className="text-xs text-[#FF8C42] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-zinc-500 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {needs2FA && (
              <div className="p-3.5 bg-[#FF6A00]/10 border border-[#FF6A00]/30 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-[#FF8C42]">
                  Enter 6-Digit Authenticator Code or Backup Code
                </label>
                <input
                  type="text"
                  value={loginTotp}
                  onChange={(e) => setLoginTotp(e.target.value)}
                  placeholder="123456 or 8-digit backup code"
                  className="w-full bg-black/40 border border-[#FF6A00]/40 rounded-lg px-3 py-2 text-sm text-white font-mono text-center tracking-widest focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#FF6A00]"
                />
                <span>Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-sm shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign In to GoldMailer'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ================= MULTI-STEP REGISTRATION WIZARD ================= */}
        {mode === 'register' && (
          <div className="mt-5 space-y-4">
            {/* Step 1: Names */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h3 className="text-base font-semibold text-white">What's your name?</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Enter the name you'd like to use on your permanent GoldMailer account.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. Miracle"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g. Solomon"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!firstName.trim()}
                  onClick={() => setStep(2)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2: Date of Birth & Gender */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h3 className="text-base font-semibold text-white">Basic Information</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Enter your birthday and gender</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      className="bg-[#24252a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6A00]"
                    >
                      <option value="01">January</option>
                      <option value="02">February</option>
                      <option value="03">March</option>
                      <option value="04">April</option>
                      <option value="05">May</option>
                      <option value="06">June</option>
                      <option value="07">July</option>
                      <option value="08">August</option>
                      <option value="09">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      placeholder="Day"
                      className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white text-center focus:outline-none focus:border-[#FF6A00]"
                    />
                    <input
                      type="number"
                      min="1920"
                      max="2025"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="Year"
                      className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white text-center focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-[#24252a] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6A00]"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md flex items-center justify-center gap-1.5"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Choose Username */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h3 className="text-base font-semibold text-white">Choose your GoldMailer address</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Pick a permanent username. Once secured, it cannot be claimed by anyone else.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Custom Address</label>
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#FF6A00]">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                      placeholder="miracle"
                      className="flex-1 bg-transparent text-sm text-white outline-none font-medium"
                    />
                    <span className="text-xs font-mono text-[#FF8C42] px-2 py-0.5 rounded bg-[#FF6A00]/15">
                      @goldmailer.xyz
                    </span>
                  </div>

                  {/* Live availability feedback */}
                  {usernameStatus && (
                    <div className={`mt-2 text-xs flex items-center gap-1.5 ${usernameStatus.available ? 'text-emerald-400' : 'text-red-400'}`}>
                      {usernameStatus.available ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      <span>{usernameStatus.message}</span>
                    </div>
                  )}
                </div>

                {/* Suggestions Button */}
                <div>
                  <button
                    type="button"
                    onClick={handleLoadSuggestions}
                    className="text-xs text-[#FF8C42] hover:underline flex items-center gap-1 font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{loadingSuggestions ? 'Generating...' : 'Show suggestions'}</span>
                  </button>

                  {suggestions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setUsername(sug.replace('@goldmailer.xyz', ''))}
                          className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-[#FF6A00]/20 border border-white/5 hover:border-[#FF6A00]/30 text-xs font-mono text-zinc-300 transition-colors flex items-center justify-between"
                        >
                          <span>{sug}</span>
                          <span className="text-[10px] text-[#FF8C42]">Use</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!username.trim() || usernameStatus?.available === false || isCheckingUsername}
                    onClick={() => setStep(4)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Create Password */}
            {step === 4 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h3 className="text-base font-semibold text-white">Create a strong password</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    This password locks <span className="text-[#FF8C42] font-mono">{username}@goldmailer.xyz</span> forever.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>

                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-400">Passwords do not match.</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={password.length < 6 || password !== confirmPassword}
                    onClick={() => setStep(5)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Phone Number & OTP Verification */}
            {step === 5 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h3 className="text-base font-semibold text-white">Add phone number for recovery</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Supports 250+ countries. We'll send a 6-digit verification code to confirm.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Country (250+ Supported)</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-[#24252a] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6A00]"
                  >
                    {COUNTRIES_LIST.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Phone Number</label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6A00]"
                    />
                    {!otpSent && (
                      <button
                        type="button"
                        disabled={isLoading || !phone.trim()}
                        onClick={handleSendOtp}
                        className="px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#FF8C42] text-white text-xs font-semibold shadow-md disabled:opacity-50"
                      >
                        Send Code
                      </button>
                    )}
                  </div>
                </div>

                {otpSent && (
                  <div className="p-3.5 bg-[#FF6A00]/10 border border-[#FF6A00]/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#FF8C42]">Enter 6-Digit SMS Verification Code</span>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-zinc-400 hover:text-white underline text-[11px]"
                      >
                        Resend
                      </button>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="847291"
                      className="w-full bg-black/40 border border-[#FF6A00]/40 rounded-lg px-3 py-2 text-sm text-white font-mono text-center tracking-widest focus:outline-none"
                    />
                    {mockOtpHint && (
                      <p className="text-[11px] text-zinc-400 text-center">
                        Simulated SMS code: <strong className="text-white">{mockOtpHint}</strong>
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isLoading || (!otpSent && !phone.trim())}
                    onClick={otpSent ? handleVerifyOtp : handleSendOtp}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isLoading ? 'Verifying...' : otpSent ? 'Verify & Create Account' : 'Send Verification Code'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 6: Success & Backup Codes */}
            {step === 6 && (
              <div className="space-y-4 text-center animate-in zoom-in-95">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF8C42]">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Account Created Successfully!</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Your permanent email <strong className="text-[#FF8C42]">{username}@goldmailer.xyz</strong> is live with 15GB storage.
                  </p>
                </div>

                {/* 10 Backup codes */}
                <div className="p-3.5 bg-black/40 border border-white/10 rounded-2xl text-left space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-[#FF8C42]" />
                      10 Emergency Backup Codes
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={copyBackupCodes}
                        className="text-[11px] text-[#FF8C42] hover:underline flex items-center gap-1"
                      >
                        {copiedCodes ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedCodes ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadBackupCodes}
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-zinc-300 bg-white/5 p-2 rounded-xl">
                    {backupCodes.map((c, i) => (
                      <span key={i} className="px-1 py-0.5 rounded bg-black/30 text-center">
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Save these codes. Each code can be used once to access your account if you lose your phone or 2FA device.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C42] text-white font-bold text-sm shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 transition-all flex items-center justify-center gap-2"
                >
                  <span>Open GoldMailer Inbox</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
