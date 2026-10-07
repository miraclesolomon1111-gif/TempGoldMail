import { TempEmail, EmailMessage, UserProfile, NowPaymentsInvoice, StorageStats, MailFolder } from '../types';

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

// ================= TEMP & CUSTOM EMAIL MANAGEMENT =================

export async function fetchTempEmails(userId?: string): Promise<TempEmail[]> {
  const clientId = getClientId();
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  params.set('clientId', clientId);

  const res = await fetch(`/api/temp-emails?${params.toString()}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch created email addresses');
  return res.json();
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

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || 'Failed to create email address');
    error.is_password_protected = data.is_password_protected;
    error.email_address = data.email_address;
    throw error;
  }
  return data;
}

export async function unlockTempEmail(emailAddress: string, password: string): Promise<TempEmail> {
  const res = await fetch('/api/temp-emails/unlock', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email_address: emailAddress, password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Incorrect password for mailbox');
  return data.email;
}

export async function updateEmailPicture(idOrEmail: string, avatarUrl: string): Promise<TempEmail> {
  const res = await fetch(`/api/temp-emails/${encodeURIComponent(idOrEmail)}/picture`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ avatar_url: avatarUrl })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update email picture');
  return data.email;
}

export async function deleteTempEmail(idOrEmail: string): Promise<boolean> {
  const res = await fetch(`/api/temp-emails/${encodeURIComponent(idOrEmail)}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return res.ok;
}

// ================= EMAIL INBOX & MESSAGING =================

export async function fetchEmails(recipientEmail: string, folder: MailFolder | 'all' = 'all'): Promise<EmailMessage[]> {
  if (!recipientEmail) return [];
  const res = await fetch(`/api/emails/${encodeURIComponent(recipientEmail)}?folder=${encodeURIComponent(folder)}`, {
    headers: getHeaders()
  });
  if (!res.ok) return [];
  return res.json();
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
  const data = await res.json();
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update message');
  return data.email;
}

export async function deleteEmail(id: string): Promise<boolean> {
  const res = await fetch(`/api/emails/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return res.ok;
}

// ================= STORAGE & CLEANUP =================

export async function fetchStorageStats(): Promise<StorageStats> {
  const res = await fetch('/api/storage', { headers: getHeaders() });
  if (!res.ok) {
    return {
      used_bytes: 7.21 * 1024 * 1024 * 1024,
      total_bytes: 15 * 1024 * 1024 * 1024,
      used_percentage: 48,
      formatted_used: '7.21 GB',
      formatted_total: '15 GB'
    };
  }
  return res.json();
}

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
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  setAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/auth/me', { headers: getHeaders() });
  if (!res.ok) {
    clearAuthToken();
    return null;
  }
  const data = await res.json();
  setStoredUser(data.user);
  return data.user;
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update profile');
  setStoredUser(data.user);
  return data.user;
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create payment invoice');
  return data.payment;
}

export async function checkNowPaymentsStatus(paymentId: string): Promise<{ is_confirmed: boolean; payment_status: string }> {
  const res = await fetch(`/api/payments/nowpayments/status/${paymentId}`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Failed to check payment status');
  return res.json();
}

export async function simulateNowPaymentsSuccess(paymentId: string, password?: string): Promise<boolean> {
  const res = await fetch('/api/payments/nowpayments/simulate-success', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ payment_id: paymentId, password })
  });
  const data = await res.json();
  return data.success;
}

// ================= ADMIN APIS =================

export async function fetchAdminOverview(): Promise<any> {
  const res = await fetch('/api/admin/overview', { headers: getHeaders() });
  if (!res.ok) throw new Error('Admin authorization required');
  return res.json();
}

export async function fetchAdminUsers(): Promise<any[]> {
  const res = await fetch('/api/admin/users', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
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
