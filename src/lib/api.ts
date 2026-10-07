import { EmailMessage, UserProfile, MailFolder, Draft, UserDevice, LoginAttempt, OAuthClient } from '../types';

// Helper: Normalize email messages
export function normalizeEmail(raw: any): EmailMessage {
  if (!raw) {
    return {
      id: 'empty_' + Date.now(),
      recipient: '',
      to_email: '',
      sender: '',
      from_email: '',
      subject: '(No Subject)',
      body_html: '',
      body_text: '',
      html: '',
      text: '',
      received_at: new Date().toISOString()
    };
  }

  const html =
    raw.html ||
    raw.body_html ||
    raw['body-html'] ||
    (typeof raw.body === 'string' && raw.body.includes('<') ? raw.body : '');

  const text =
    raw.text ||
    raw.body_text ||
    raw['body-plain'] ||
    (typeof raw.body === 'string' && !raw.body.includes('<') ? raw.body : '');

  const recipient =
    raw.to_email ||
    raw.recipient ||
    raw.to ||
    (Array.isArray(raw.to) ? raw.to[0] : '') ||
    '';

  const sender =
    raw.from_email ||
    raw.sender ||
    raw.from ||
    (Array.isArray(raw.from) ? raw.from[0] : '') ||
    'unknown@goldmailer.xyz';

  const received_at =
    raw.received_at || raw.created_at || new Date().toISOString();

  return {
    id: String(raw.id || 'msg_' + Math.random().toString(36).substring(2, 9)),
    recipient: typeof recipient === 'object' ? (recipient.email || recipient.address || String(recipient)) : String(recipient),
    to_email: typeof recipient === 'object' ? (recipient.email || recipient.address || String(recipient)) : String(recipient),
    to: typeof recipient === 'object' ? (recipient.email || recipient.address || String(recipient)) : String(recipient),
    cc: raw.cc || '',
    bcc: raw.bcc || '',
    sender: typeof sender === 'object' ? (sender.email || sender.address || sender.name || String(sender)) : String(sender),
    from_email: typeof sender === 'object' ? (sender.email || sender.address || sender.name || String(sender)) : String(sender),
    sender_name: raw.sender_name || (typeof sender === 'string' ? sender.split('@')[0] : 'Sender'),
    subject: raw.subject || '(No Subject)',
    body_html: html,
    html: html,
    body_text: text,
    text: text,
    body: html || text || '',
    raw: raw.raw || raw,
    received_at,
    created_at: received_at,
    is_read: Boolean(raw.is_read),
    is_starred: Boolean(raw.is_starred),
    folder: raw.folder || 'primary',
    category: raw.category || 'primary',
    scheduled_for: raw.scheduled_for,
    avatar_color: raw.avatar_color
  };
}

// Email local cache helpers to eliminate flicker and guarantee permanent offline/client persistence
export function getCachedEmails(email: string): EmailMessage[] {
  try {
    const raw = localStorage.getItem(`goldmail_cached_emails_${email.toLowerCase().trim()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeEmail);
    }
  } catch {}
  return [];
}

export function setCachedEmails(email: string, emails: EmailMessage[]): void {
  try {
    localStorage.setItem(`goldmail_cached_emails_${email.toLowerCase().trim()}`, JSON.stringify(emails.slice(0, 300)));
  } catch {}
}

// Active email address management
export function getStoredActiveEmail(): string {
  const user = getStoredUser();
  if (user?.email) return user.email;
  return localStorage.getItem('goldmail_active_email') || '';
}

export function setStoredActiveEmail(email: string): void {
  if (email) {
    localStorage.setItem('goldmail_active_email', email.toLowerCase().trim());
  } else {
    localStorage.removeItem('goldmail_active_email');
  }
}

// Multi-Account Manager
export interface StoredAccount {
  id: string;
  email: string;
  username: string;
  name: string;
  token: string;
  avatar_url?: string;
  role?: string;
}

export function getStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem('goldmailer_multi_accounts');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}
  
  const curUser = getStoredUser();
  const token = getAuthToken();
  if (curUser) {
    const defaultAcc: StoredAccount = {
      id: curUser.id,
      email: curUser.email,
      username: curUser.username,
      name: curUser.first_name ? `${curUser.first_name} ${curUser.last_name || ''}`.trim() : (curUser.name || curUser.username),
      token: token || '',
      avatar_url: curUser.avatar_url,
      role: curUser.role
    };
    saveStoredAccounts([defaultAcc]);
    return [defaultAcc];
  }

  return [];
}

export function saveStoredAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem('goldmailer_multi_accounts', JSON.stringify(accounts));
}

export function addStoredAccount(account: StoredAccount): void {
  const list = getStoredAccounts();
  const idx = list.findIndex(a => a.email.toLowerCase() === account.email.toLowerCase());
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...account };
  } else {
    list.unshift(account);
  }
  saveStoredAccounts(list);
}

export function removeStoredAccount(email: string): void {
  let list = getStoredAccounts();
  list = list.filter(a => a.email.toLowerCase() !== email.toLowerCase());
  saveStoredAccounts(list);
  if (getStoredActiveEmail().toLowerCase() === email.toLowerCase()) {
    if (list.length > 0) {
      switchActiveAccount(list[0].email);
    } else {
      clearAuthToken();
    }
  }
}

export function switchActiveAccount(email: string): StoredAccount | null {
  const list = getStoredAccounts();
  const found = list.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (found) {
    setAuthToken(found.token);
    setStoredActiveEmail(found.email);
    setStoredUser({
      id: found.id,
      email: found.email,
      username: found.username,
      first_name: found.name,
      role: (found.role as any) || 'user'
    });
    return found;
  }
  return null;
}

// Auto-initialize session only if token exists
export async function initDefaultSession(): Promise<UserProfile | null> {
  try {
    const token = getAuthToken();
    if (token) {
      return await fetchCurrentUser();
    }
    return null;
  } catch {
    return null;
  }
}

// Auth token helpers
export function getAuthToken(): string | null {
  return localStorage.getItem('goldmail_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('goldmail_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('goldmail_token');
  localStorage.removeItem('goldmail_user');
}

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem('goldmail_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile | null): void {
  if (user) {
    localStorage.setItem('goldmail_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('goldmail_user');
  }
}

function getHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

async function safeJsonParse(res: Response, defaultError = 'Request failed'): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(`Server status ${res.status}: ${text.slice(0, 100)}`);
    }
    return { ok: res.ok };
  }
}

// ================= AUTHENTICATION APIS =================

// Live Username Availability Check
export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; username: string; message: string; full_email?: string }> {
  try {
    const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
    return await safeJsonParse(res);
  } catch {
    return {
      available: true,
      username,
      message: 'Username format valid.'
    };
  }
}

// Smart Username Suggestions
export async function suggestUsernames(firstName: string, lastName: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/auth/suggest-usernames?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`);
    const data = await safeJsonParse(res);
    return data.suggestions || [
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}123@goldmailer.xyz`,
      `${firstName.toLowerCase()}${lastName.toLowerCase()}07@goldmailer.xyz`,
      `${firstName.toLowerCase()}.${new Date().getFullYear()}@goldmailer.xyz`
    ];
  } catch {
    return [
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}123@goldmailer.xyz`,
      `${firstName.toLowerCase()}${lastName.toLowerCase()}07@goldmailer.xyz`,
      `${firstName.toLowerCase()}.${new Date().getFullYear()}@goldmailer.xyz`
    ];
  }
}

// Send Phone OTP
export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; message: string; mock_code?: string }> {
  const res = await fetch('/api/auth/send-phone-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  return await safeJsonParse(res);
}

// Verify Phone OTP
export async function verifyPhoneOtp(phone: string, code: string): Promise<{ success: boolean; verified: boolean }> {
  const res = await fetch('/api/auth/verify-phone-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code })
  });
  return await safeJsonParse(res);
}

// Multi-step Registration
export async function registerGoldUser(formData: {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  username: string;
  password: string;
  phone: string;
  country: string;
}): Promise<{ success: boolean; token: string; user: UserProfile; backup_codes: string[] }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed');
  }
  if (data.token && data.user) {
    setAuthToken(data.token);
    setStoredUser(data.user);
    setStoredActiveEmail(data.user.email);
    addStoredAccount({
      id: data.user.id,
      email: data.user.email,
      username: data.user.username,
      name: data.user.first_name ? `${data.user.first_name} ${data.user.last_name || ''}`.trim() : (data.user.name || data.user.username),
      token: data.token,
      avatar_url: data.user.avatar_url,
      role: data.user.role
    });
  }
  return data;
}

export async function registerUser(formData: any): Promise<any> {
  const username = formData.email ? formData.email.split('@')[0] : (formData.username || 'user');
  return registerGoldUser({
    firstName: formData.name || formData.firstName || username,
    lastName: formData.lastName || '',
    dob: formData.dob || '1998-05-15',
    gender: formData.gender || 'Prefer not to say',
    username,
    password: formData.password,
    phone: formData.phone || '',
    country: formData.country || 'United States'
  });
}

// Login with Suspicious Device & 2FA Detection
export async function loginGoldUser(credentials: {
  identifier: string;
  password: string;
  totp_code?: string;
  backup_code?: string;
}): Promise<any> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) {
    throw new Error(data.error || 'Login failed');
  }
  if (data.token && data.user) {
    setAuthToken(data.token);
    setStoredUser(data.user);
    setStoredActiveEmail(data.user.email);
    addStoredAccount({
      id: data.user.id,
      email: data.user.email,
      username: data.user.username,
      name: data.user.first_name ? `${data.user.first_name} ${data.user.last_name || ''}`.trim() : (data.user.name || data.user.username),
      token: data.token,
      avatar_url: data.user.avatar_url,
      role: data.user.role
    });
  }
  return data;
}

export async function loginUser(emailOrIdentifier: string, password: string): Promise<any> {
  return loginGoldUser({ identifier: emailOrIdentifier, password });
}

// 2FA Verification API
export async function verify2FALogin(params: {
  identifier?: string;
  email?: string;
  temp_auth_token?: string;
  code: string;
}): Promise<any> {
  const res = await fetch('/api/auth/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) {
    throw new Error(data.error || 'Verification failed');
  }
  if (data.token && data.user) {
    setAuthToken(data.token);
    setStoredUser(data.user);
    setStoredActiveEmail(data.user.email);
    addStoredAccount({
      id: data.user.id,
      email: data.user.email,
      username: data.user.username,
      name: data.user.first_name ? `${data.user.first_name} ${data.user.last_name || ''}`.trim() : (data.user.name || data.user.username),
      token: data.token,
      avatar_url: data.user.avatar_url,
      role: data.user.role
    });
  }
  return data;
}

// Forgot Password API
export async function requestPasswordReset(identifier: string): Promise<{ success: boolean; message: string; recovery_email?: string; reset_url?: string; reset_token?: string }> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });
  const data = await safeJsonParse(res);
  if (!res.ok) {
    throw new Error(data.error || 'Password reset request failed');
  }
  return data;
}

// Reset Password API
export async function confirmPasswordReset(params: {
  token: string;
  new_password: string;
  email?: string;
}): Promise<{ success: boolean; message: string; user?: UserProfile; token?: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) {
    throw new Error(data.error || 'Password reset failed');
  }
  if (data.token && data.user) {
    setAuthToken(data.token);
    setStoredUser(data.user);
    setStoredActiveEmail(data.user.email);
  }
  return data;
}

// Poll Login Attempt Status (for suspicious device screen)
export async function checkLoginAttemptStatus(attemptId: string): Promise<any> {
  const res = await fetch(`/api/security/login-attempts/${attemptId}/status`);
  return await safeJsonParse(res);
}

// Respond to Login Attempt (Approve, Block, or Verify Code)
export async function respondToLoginAttempt(
  attemptId: string,
  action: 'approve' | 'block' | 'verify_code',
  code?: string
): Promise<any> {
  const res = await fetch(`/api/security/login-attempts/${attemptId}/respond`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action, code })
  });
  return await safeJsonParse(res);
}

// Check for incoming push approval requests on active session
export async function getPendingLoginAttempts(): Promise<LoginAttempt[]> {
  try {
    const res = await fetch('/api/security/login-attempts/pending', {
      headers: getHeaders()
    });
    return await safeJsonParse(res);
  } catch {
    return [];
  }
}

// Fetch Current Authenticated User
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: getHeaders() });
    if (!res.ok) return null;
    const data = await safeJsonParse(res);
    if (data.user) {
      setStoredUser(data.user);
      return data.user;
    }
    return null;
  } catch {
    return getStoredUser();
  }
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) throw new Error(data.error || 'Failed to update profile');
  setStoredUser(data.user);
  return data.user;
}

// ================= SECURITY & 2FA =================

export async function setup2FA(): Promise<{ secret: string; otpauth_url: string; email: string }> {
  const res = await fetch('/api/security/2fa/setup', {
    method: 'POST',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}

export async function enable2FA(code: string): Promise<{ success: boolean; two_factor_enabled: boolean; backup_codes: string[] }> {
  const res = await fetch('/api/security/2fa/enable', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ code })
  });
  const data = await safeJsonParse(res);
  if (!res.ok) throw new Error(data.error || 'Failed to verify code');
  return data;
}

export async function disable2FA(): Promise<{ success: boolean }> {
  const res = await fetch('/api/security/2fa/disable', {
    method: 'POST',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}

export async function regenerateBackupCodes(): Promise<{ backup_codes: string[] }> {
  const res = await fetch('/api/security/backup-codes/regenerate', {
    method: 'POST',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}

export async function fetchUserDevices(): Promise<UserDevice[]> {
  try {
    const res = await fetch('/api/security/devices', { headers: getHeaders() });
    return await safeJsonParse(res);
  } catch {
    return [];
  }
}

export async function revokeAllOtherDevices(): Promise<void> {
  await fetch('/api/security/devices/revoke-all', {
    method: 'POST',
    headers: getHeaders()
  });
}

// ================= DRAFT AUTO-SAVE =================

export async function fetchDrafts(): Promise<Draft[]> {
  try {
    const res = await fetch('/api/drafts', { headers: getHeaders() });
    return await safeJsonParse(res);
  } catch {
    return [];
  }
}

export async function saveDraft(draft: {
  id?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; draft: Draft; saved_at_formatted: string }> {
  const res = await fetch('/api/drafts', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(draft)
  });
  return await safeJsonParse(res);
}

export async function deleteDraft(id: string): Promise<void> {
  await fetch(`/api/drafts/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
}

// ================= EMAILS & SYNC =================

export async function fetchEmails(emailAddress: string, folder: string = 'all'): Promise<EmailMessage[]> {
  try {
    const res = await fetch(`/api/emails/${encodeURIComponent(emailAddress)}?folder=${encodeURIComponent(folder)}`);
    const list = await safeJsonParse(res);
    if (Array.isArray(list)) {
      const normalized = list.map(normalizeEmail);
      if (folder === 'all' || folder === 'all_mail' || folder === 'all_inboxes') {
        const existingCached = getCachedEmails(emailAddress);
        const mergedMap = new Map<string, EmailMessage>();
        for (const em of existingCached) {
          mergedMap.set(em.id, em);
        }
        for (const em of normalized) {
          mergedMap.set(em.id, em);
        }
        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => new Date(b.received_at || b.created_at || 0).getTime() - new Date(a.received_at || a.created_at || 0).getTime());
        setCachedEmails(emailAddress, merged);
        return merged;
      }
      return normalized;
    }
    return getCachedEmails(emailAddress);
  } catch {
    return getCachedEmails(emailAddress);
  }
}

export async function simulateInboundEmail(payload?: {
  to?: string;
  from?: string;
  sender_name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
}): Promise<any> {
  const res = await fetch('/api/emails/simulate-inbound', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload || { to: getStoredActiveEmail() })
  });
  return await safeJsonParse(res);
}

export async function syncEmails(email?: string): Promise<{ success: boolean; new_emails_synced: number; total_emails: number; synced_at: string }> {
  const res = await fetch('/api/emails/sync', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email: email || getStoredActiveEmail() })
  });
  return await safeJsonParse(res);
}

export async function sendEmail(payload: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  sender?: string;
  scheduled_for?: string;
  draft_id?: string;
}): Promise<any> {
  const res = await fetch('/api/emails/send', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await safeJsonParse(res);
  if (!res.ok) throw new Error(data.error || 'Failed to send email');
  return data;
}

export async function updateEmailStatus(
  id: string,
  updates: { is_read?: boolean; is_starred?: boolean; folder?: MailFolder }
): Promise<any> {
  const res = await fetch(`/api/emails/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  return await safeJsonParse(res);
}

export async function deleteEmail(id: string, permanent: boolean = false): Promise<any> {
  const res = await fetch(`/api/emails/${id}?permanent=${permanent}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}

// ================= OAUTH 2.0 PROVIDER =================

export async function fetchOAuthClients(): Promise<OAuthClient[]> {
  try {
    const res = await fetch('/api/oauth/clients', { headers: getHeaders() });
    return await safeJsonParse(res);
  } catch {
    return [];
  }
}

export async function createOAuthClient(data: {
  app_name: string;
  redirect_uri: string;
  logo_url?: string;
  website_url?: string;
}): Promise<{ success: boolean; client: OAuthClient }> {
  const res = await fetch('/api/oauth/clients', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  const parsed = await safeJsonParse(res);
  if (!res.ok) throw new Error(parsed.error || 'Failed to create OAuth client');
  return parsed;
}

export async function authorizeOAuthConsent(data: {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
}): Promise<{ success: boolean; redirect_url: string; code: string }> {
  const res = await fetch('/api/oauth/authorize', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  const parsed = await safeJsonParse(res);
  if (!res.ok) throw new Error(parsed.error || 'OAuth authorization failed');
  return parsed;
}

export async function exchangeOAuthToken(data: {
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}): Promise<any> {
  const res = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return await safeJsonParse(res);
}

export async function fetchOAuthUserInfo(accessToken: string): Promise<any> {
  const res = await fetch('/api/oauth/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return await safeJsonParse(res);
}

// ================= ADMIN APIS (/admin) =================

export async function fetchAdminOverview(): Promise<any> {
  const res = await fetch('/api/admin/overview', { headers: getHeaders() });
  return await safeJsonParse(res);
}

export async function fetchAdminUsers(): Promise<UserProfile[]> {
  const res = await fetch('/api/admin/users', { headers: getHeaders() });
  return await safeJsonParse(res);
}

export async function toggleBanUser(id: string): Promise<any> {
  const res = await fetch(`/api/admin/users/${id}/ban`, {
    method: 'POST',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}

export async function deleteAdminUser(id: string): Promise<any> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return await safeJsonParse(res);
}
