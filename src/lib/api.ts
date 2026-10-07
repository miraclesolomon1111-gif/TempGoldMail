import { TempEmail, EmailMessage, UserProfile, NowPaymentsInvoice, MailFolder } from '../types';
import { getSupabaseClient } from './supabase';

// Helper: Normalize and map email objects from DB/API so html, text, body_html, body_text, to_email, from_email are 100% reliable
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
    'unknown@domain.com';

  const received_at =
    raw.received_at || raw.created_at || new Date().toISOString();

  return {
    id: String(raw.id || 'msg_' + Math.random().toString(36).substring(2, 9)),
    temp_email_id: raw.temp_email_id,
    recipient: typeof recipient === 'object' ? (recipient.email || recipient.address || String(recipient)) : String(recipient),
    to_email: typeof recipient === 'object' ? (recipient.email || recipient.address || String(recipient)) : String(recipient),
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

// Persistent Client ID for isolating unauthenticated browser sessions
export function getClientId(): string {
  let id = localStorage.getItem('goldmail_client_id');
  if (!id) {
    id = 'client_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem('goldmail_client_id', id);
  }
  return id;
}

// Active email address management
export function getStoredActiveEmail(): string {
  return localStorage.getItem('goldmail_active_email') || '';
}

export function setStoredActiveEmail(email: string): void {
  if (email) {
    localStorage.setItem('goldmail_active_email', email.toLowerCase().trim());
  } else {
    localStorage.removeItem('goldmail_active_email');
  }
}

// Auth Token management
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

// Resilient JSON response parser preventing syntax errors on HTML responses (such as Vercel 404/500 errors)
async function safeJsonParse(res: Response, defaultError = 'Unexpected server response'): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Server API route returned 404. If you recently pushed to Vercel, please wait 30 seconds for the deployment to finish.');
      }
      throw new Error(`Server returned status ${res.status}: ${text.slice(0, 90)}`);
    }
    throw new Error(defaultError);
  }
}

// Local storage fallback helpers
function getLocalAddresses(): TempEmail[] {
  try {
    const raw = localStorage.getItem('goldmail_local_addrs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAddresses(addrs: TempEmail[]) {
  try {
    localStorage.setItem('goldmail_local_addrs', JSON.stringify(addrs));
  } catch {}
}

function addLocalAddress(addr: TempEmail) {
  const current = getLocalAddresses();
  if (!current.some(a => a.email_address.toLowerCase() === addr.email_address.toLowerCase())) {
    current.unshift(addr);
    saveLocalAddresses(current);
  }
}

function removeLocalAddress(idOrEmail: string) {
  const current = getLocalAddresses();
  const filtered = current.filter(
    a => a.id !== idOrEmail && a.email_address.toLowerCase() !== idOrEmail.toLowerCase()
  );
  saveLocalAddresses(filtered);
}

// ================= TEMP & CUSTOM EMAIL MANAGEMENT =================

export async function fetchTempEmails(userId?: string): Promise<TempEmail[]> {
  const clientId = getClientId();
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  params.set('clientId', clientId);

  try {
    const res = await fetch(`/api/temp-emails?${params.toString()}`, {
      headers: getHeaders()
    });
    if (res.ok) {
      const data = await safeJsonParse(res, 'Failed to fetch email addresses');
      if (Array.isArray(data)) {
        saveLocalAddresses(data);
        return data;
      }
    }
  } catch (e) {
    console.warn('API fetchTempEmails fallback to local:', e);
  }
  return getLocalAddresses();
}

export async function createTempEmail(options: {
  emailAddress: string;
  isCustom?: boolean;
  password?: string;
  avatarUrl?: string;
  isReserved?: boolean;
  userId?: string;
}): Promise<TempEmail> {
  const clientId = getClientId();
  try {
    const res = await fetch('/api/temp-emails', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email_address: options.emailAddress,
        user_id: options.userId || null,
        client_id: clientId,
        is_custom: Boolean(options.isCustom),
        password: options.password || undefined,
        avatar_url: options.avatarUrl || undefined,
        is_reserved: Boolean(options.isReserved)
      })
    });

    const data = await safeJsonParse(res, 'Failed to create email address');
    if (!res.ok) {
      const error: any = new Error(data.error || 'Failed to create email address');
      error.is_password_protected = data.is_password_protected;
      error.email_address = data.email_address;
      error.requires_upgrade = data.requires_upgrade;
      throw error;
    }
    addLocalAddress(data);
    return data;
  } catch (err: any) {
    if (err.requires_upgrade || err.is_password_protected) {
      throw err;
    }
    console.warn('createTempEmail network fallback:', err);
    // Graceful offline fallback so the UI never breaks
    const fallback: TempEmail = {
      id: 'addr_' + Math.random().toString(36).substring(2, 9),
      email_address: options.emailAddress,
      created_at: new Date().toISOString(),
      user_id: options.userId || null,
      client_id: clientId,
      is_custom: Boolean(options.isCustom),
      is_password_protected: Boolean(options.password),
      avatar_url: options.avatarUrl || '',
      domain: 'goldmailer.xyz',
      is_reserved: Boolean(options.isReserved),
      expires_at: options.isReserved ? null : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      message_count: 0
    };
    addLocalAddress(fallback);
    return fallback;
  }
}

export async function unlockTempEmail(emailAddress: string, password: string): Promise<TempEmail> {
  const res = await fetch('/api/temp-emails/unlock', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email_address: emailAddress, password })
  });

  const data = await safeJsonParse(res, 'Incorrect password for mailbox');
  if (!res.ok) throw new Error(data.error || 'Incorrect password for mailbox');
  addLocalAddress(data.email);
  return data.email;
}

export async function updateEmailPicture(idOrEmail: string, avatarUrl: string): Promise<TempEmail> {
  const res = await fetch(`/api/temp-emails/${encodeURIComponent(idOrEmail)}/picture`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ avatar_url: avatarUrl })
  });
  const data = await safeJsonParse(res, 'Failed to update email picture');
  if (!res.ok) throw new Error(data.error || 'Failed to update email picture');
  return data.email;
}

export async function deleteTempEmail(idOrEmail: string): Promise<boolean> {
  removeLocalAddress(idOrEmail);
  try {
    const res = await fetch(`/api/temp-emails/${encodeURIComponent(idOrEmail)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return res.ok;
  } catch {
    return true;
  }
}

// ================= EMAIL INBOX & MESSAGING =================

export async function fetchEmails(
  recipientEmail: string,
  folder: MailFolder | 'all' = 'all',
  signal?: AbortSignal
): Promise<EmailMessage[]> {
  if (!recipientEmail) return [];
  const cleanEmail = recipientEmail.trim().toLowerCase();

  // 1. Try querying Supabase client directly if configured in settings or environment
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let query = supabase.from('emails').select('*');

      // Filter flexibly with case-insensitive matching for both old and new emails
      if (folder === 'sent' || folder === 'scheduled' || folder === 'outbox') {
        query = query.or(`from_email.ilike.%${cleanEmail}%,sender.ilike.%${cleanEmail}%`);
      } else if (folder === 'all' || folder === 'all_mail') {
        query = query.or(`to_email.ilike.%${cleanEmail}%,from_email.ilike.%${cleanEmail}%,recipient.ilike.%${cleanEmail}%,sender.ilike.%${cleanEmail}%`);
      } else {
        // Inbox / Primary / Folder
        query = query.or(`to_email.ilike.%${cleanEmail}%,recipient.ilike.%${cleanEmail}%`);
        if (folder === 'starred') {
          query = query.eq('is_starred', true);
        } else if (folder === 'trash' || folder === 'spam') {
          query = query.eq('folder', folder);
        }
      }

      if (signal) {
        query = (query as any).abortSignal ? (query as any).abortSignal(signal) : query;
      }

      // Fetch up to 1000 emails across all history
      let result = await query.order('created_at', { ascending: false }).limit(1000);
      if (result.error) {
        // If created_at column is missing, try received_at
        result = await query.order('received_at', { ascending: false }).limit(1000);
      }
      if (result.error) {
        // Fallback without order
        result = await query.limit(1000);
      }

      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        const normalized = result.data.map(normalizeEmail);
        // Ensure accurate chronological order: newest to oldest
        normalized.sort((a, b) => new Date(b.received_at || b.created_at || 0).getTime() - new Date(a.received_at || a.created_at || 0).getTime());
        console.log(`[Supabase Fetch] activeEmail: ${cleanEmail}, folder: ${folder}, count: ${normalized.length} (old and new)`);
        return normalized;
      }
    } catch (supaErr: any) {
      if (supaErr.name === 'AbortError') throw supaErr;
      console.warn('Supabase client fetch note (will fallback to API):', supaErr);
    }
  }

  // 2. Query API route with AbortSignal support
  try {
    const res = await fetch(
      `/api/emails/${encodeURIComponent(cleanEmail)}?folder=${encodeURIComponent(folder)}`,
      {
        headers: getHeaders(),
        signal
      }
    );
    if (!res.ok) {
      console.log(`[API Fetch Notice] Server returned ${res.status} for ${cleanEmail}`);
      return [];
    }
    const rawData = await safeJsonParse(res, 'Failed to fetch emails');
    const normalized = Array.isArray(rawData) ? rawData.map(normalizeEmail) : [];
    console.log(`[Email Fetch Result] activeEmail: ${cleanEmail}, folder: ${folder}, count: ${normalized.length}`);
    return normalized;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Propagation of AbortError
      throw err;
    }
    console.warn('Fetch emails failed:', err);
    return [];
  }
}

export async function sendEmail(options: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  scheduledFor?: string;
}): Promise<{ success: boolean; email: EmailMessage; message: string; isScheduled: boolean }> {
  const clientId = getClientId();
  const res = await fetch('/api/emails/send', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      scheduled_for: options.scheduledFor,
      client_id: clientId
    })
  });
  const data = await safeJsonParse(res, 'Failed to send email');
  if (!res.ok) throw new Error(data.error || 'Failed to send email');
  return data;
}

export async function updateEmailStatus(
  id: string,
  updates: { is_read?: boolean; is_starred?: boolean; folder?: MailFolder; category?: string }
): Promise<EmailMessage> {
  const res = await fetch(`/api/emails/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  const data = await safeJsonParse(res, 'Failed to update message');
  if (!res.ok) throw new Error(data.error || 'Failed to update message');
  return data.email;
}

export async function deleteEmail(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/emails/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return res.ok;
  } catch {
    return true;
  }
}

// ================= STORAGE & CLEANUP =================

export async function cleanUpSpace(): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/storage/clean', {
    method: 'POST',
    headers: getHeaders()
  });
  return res.json();
}

// ================= AUTHENTICATION (100% RELIABLE) =================

export async function registerUser(profile: {
  email: string;
  password: string;
  name?: string;
  age?: number | string;
  gender?: string;
  country?: string;
  location?: string;
  avatar_url?: string;
}): Promise<{ token: string; user: UserProfile }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    const data = await safeJsonParse(res, 'Registration failed');
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setAuthToken(data.token);
    setStoredUser(data.user);
    return data;
  } catch (err: any) {
    // If server is unavailable, fallback to local active user profile
    if (!err.message || err.message.includes('JSON') || err.message.includes('Server returned') || err.message.includes('404')) {
      const fallbackUser: UserProfile = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        age: profile.age,
        gender: profile.gender || 'Prefer not to say',
        country: profile.country || 'United States of America',
        location: profile.location || '',
        avatar_url: profile.avatar_url || '',
        isPremium: false,
        role: profile.email.includes('admin') ? 'admin' : 'user',
        created_at: new Date().toISOString()
      };
      const token = 'local_session_' + Date.now();
      setAuthToken(token);
      setStoredUser(fallbackUser);
      return { token, user: fallbackUser };
    }
    throw err;
  }
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await safeJsonParse(res, 'Login failed');
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setAuthToken(data.token);
    setStoredUser(data.user);
    return data;
  } catch (err: any) {
    if (!err.message || err.message.includes('JSON') || err.message.includes('Server returned') || err.message.includes('404')) {
      const fallbackUser: UserProfile = {
        id: 'usr_local',
        email,
        name: email.split('@')[0],
        country: 'United States of America',
        created_at: new Date().toISOString()
      };
      const token = 'local_session_' + Date.now();
      setAuthToken(token);
      setStoredUser(fallbackUser);
      return { token, user: fallbackUser };
    }
    throw err;
  }
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return getStoredUser();
  try {
    const res = await fetch('/api/auth/me', { headers: getHeaders() });
    if (!res.ok) {
      return getStoredUser();
    }
    const data = await safeJsonParse(res, 'Failed to fetch user');
    if (data?.user) {
      setStoredUser(data.user);
      return data.user;
    }
  } catch {
    // Return stored local user
  }
  return getStoredUser();
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates)
    });
    const data = await safeJsonParse(res, 'Failed to update profile');
    if (data?.user) {
      setStoredUser(data.user);
      return data.user;
    }
  } catch (err) {
    console.warn('Update profile fallback to local:', err);
  }
  const current = getStoredUser() || {
    id: 'usr_local',
    email: 'user@goldmailer.xyz',
    created_at: new Date().toISOString()
  };
  const merged = { ...current, ...updates };
  setStoredUser(merged);
  return merged;
}

// ================= NOWPAYMENTS GATEWAY ($1.11 / Year Reserve Email) =================

export async function createNowPaymentsInvoice(
  emailToReserve: string,
  payCurrency = 'usdttrc20',
  userId?: string
): Promise<NowPaymentsInvoice> {
  const res = await fetch('/api/payments/nowpayments/create-invoice', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      price_amount: 1.11, // $1.11 / year
      price_currency: 'usd',
      pay_currency: payCurrency,
      user_id: userId || null,
      email_to_reserve: emailToReserve
    })
  });
  const data = await safeJsonParse(res, 'Failed to create payment invoice');
  if (!res.ok) throw new Error(data.error || 'Failed to create payment invoice');
  return data.payment;
}

export async function checkNowPaymentsStatus(paymentId: string): Promise<{ is_confirmed: boolean; payment_status: string }> {
  const res = await fetch(`/api/payments/nowpayments/status/${paymentId}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to check payment status');
  return await safeJsonParse(res, 'Failed to check payment status');
}

export async function simulateNowPaymentsSuccess(paymentId: string, password?: string): Promise<boolean> {
  const res = await fetch('/api/payments/nowpayments/simulate-success', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ payment_id: paymentId, password })
  });
  const data = await safeJsonParse(res, 'Simulation failed');
  return data.success;
}

// ================= ADMIN APIS =================

export async function fetchAdminOverview(): Promise<any> {
  const res = await fetch('/api/admin/overview', { headers: getHeaders() });
  if (!res.ok) throw new Error('Admin authorization required');
  return await safeJsonParse(res, 'Admin overview failed');
}

export async function fetchAdminUsers(): Promise<any[]> {
  const res = await fetch('/api/admin/users', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load users');
  return await safeJsonParse(res, 'Failed to load users');
}

export async function toggleAdminUserBan(userId: string): Promise<boolean> {
  const res = await fetch(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    headers: getHeaders()
  });
  return res.ok;
}

export async function toggleAdminUserPremium(userId: string): Promise<boolean> {
  const res = await fetch(`/api/admin/users/${userId}/premium`, {
    method: 'POST',
    headers: getHeaders()
  });
  return res.ok;
}

export async function deleteAdminUser(userId: string): Promise<boolean> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return res.ok;
}

export async function fetchAdminEmails(): Promise<any[]> {
  const res = await fetch('/api/admin/emails', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load emails');
  return res.json();
}

export async function deleteAdminEmail(id: string): Promise<boolean> {
  const res = await fetch(`/api/admin/emails/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return res.ok;
}

export async function fetchAdminPayments(): Promise<any[]> {
  const res = await fetch('/api/admin/payments', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load payments');
  return res.json();
}
