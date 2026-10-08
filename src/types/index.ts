export type MailFolder = 
  | 'primary'
  | 'promotions'
  | 'social'
  | 'updates'
  | 'starred'
  | 'snoozed'
  | 'important'
  | 'sent'
  | 'scheduled'
  | 'outbox'
  | 'drafts'
  | 'all_mail'
  | 'spam'
  | 'trash';

export interface EmailMessage {
  id: string;
  messageId?: string;
  temp_email_id?: string;
  recipient: string;
  to_email?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  sender: string;
  from_email?: string;
  from?: string;
  sender_name?: string;
  subject: string;
  body_html: string;
  body_text: string;
  html?: string;
  text?: string;
  body?: string;
  raw?: any;
  received_at: string;
  created_at?: string;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: MailFolder;
  category?: 'primary' | 'promotions' | 'social' | 'updates';
  status?: 'inbox' | 'trash' | 'deleted' | 'sent' | 'draft' | 'spam';
  trashed_at?: string;
  scheduled_for?: string;
  avatar_color?: string;
}

export interface TempEmail {
  id: string;
  email_address: string;
  created_at: string;
  user_id?: string | null;
  client_id?: string;
  message_count?: number;
  is_custom?: boolean;
  is_password_protected?: boolean;
  avatar_url?: string;
  domain?: string;
  expires_at?: string | null;
  is_reserved?: boolean;
  name?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  gender?: string;
  age?: number | string;
  country?: string;
  location?: string;
  phone?: string;
  recovery_phone?: string;
  backup_email?: string;
  avatar_url?: string;
  isPremium?: boolean;
  role?: 'user' | 'admin';
  created_at?: string;
  is_banned?: boolean;
  banned_at?: string;
  ban_reason?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  plan_billing?: 'monthly' | 'yearly';
  plan_status?: 'active' | 'cancelled' | 'trial';
  two_factor_enabled?: boolean;
  two_factor_secret?: string;
  backup_codes?: string[];
  storage_used_bytes?: number;
  storage_limit_bytes?: number;
  storage_used_gb?: number;
  storage_quota_gb?: number;
}

export interface Draft {
  id: string;
  user_id: string;
  sender_email?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  updated_at: string;
  created_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  device_name: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  last_active: string;
  is_trusted: boolean;
  is_current?: boolean;
  created_at: string;
}

export interface LoginAttempt {
  id: string;
  user_id: string;
  email: string;
  device_name: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  code: string;
  created_at: string;
  expires_at: string;
}

export interface OAuthClient {
  client_id: string;
  client_secret: string;
  app_name: string;
  redirect_uri: string;
  logo_url?: string;
  website_url?: string;
  owner_user_id: string;
  created_at: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
  };
}

// Phone Number & SMS Types
export interface SMSMessage {
  id: string;
  userId?: string;
  from: string;
  to: string;
  body: string;
  receivedAt: string;
  messageSid?: string;
  direction: 'inbound' | 'outbound';
  status?: string;
  is_read?: boolean;
}

export interface UserPhoneNumber {
  id: string;
  userId: string;
  phoneNumber: string;
  friendlyName?: string;
  provider: 'twilio';
  status: 'active' | 'expired' | 'pending';
  purchasedAt: string;
  expiresAt: string;
  daysRemaining?: number;
  autoRenew?: boolean;
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  isoCountry: string;
  priceUsd: number;
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
}

export interface TwilioLogItem {
  sid: string;
  from: string;
  to: string;
  body: string;
  status: string;
  direction: string;
  dateSent: string;
  price?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface PhoneCall {
  id: string;
  userId?: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  status: 'completed' | 'in-progress' | 'ringing' | 'queued' | 'failed' | 'busy' | 'no-answer' | 'canceled';
  durationSeconds?: number;
  callSid?: string;
  startedAt: string;
  endedAt?: string;
}

export interface PhoneContact {
  id: string;
  userId?: string;
  name: string;
  phoneNumber: string;
  notes?: string;
  createdAt: string;
}

// Admin Panel Types
export interface AdminOverviewStats {
  totalUsers: number;
  totalEmails: number;
  activeAccountsCount: number;
  totalDrafts: number;
  totalOAuthClients: number;
  totalStorageUsedBytes: number;
  totalStorageUsedMb: string;
  totalStorageUsedGb: string;
  blockedIpsCount: number;
  openTicketsCount: number;
  activeDomainsCount: number;
  monthlyRevenueUsd: number;
  adminPhoneNumber: string;
  isTwilioConfigured: boolean;
  isResendConfigured: boolean;
  isDatabaseConnected: boolean;
  dbType: string;
}

export interface AdminActivityLogItem {
  id: string;
  admin_email: string;
  action: string;
  target_type: 'user' | 'email' | 'system' | 'security' | 'payment' | 'domain';
  target_id?: string;
  details: string;
  ip?: string;
  created_at: string;
}

export interface AdminSupportTicket {
  id: string;
  user_email: string;
  user_name?: string;
  subject: string;
  category: 'general' | 'billing' | 'account' | 'technical' | 'abuse';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  messages: {
    id: string;
    sender_email: string;
    sender_name: string;
    is_admin: boolean;
    content: string;
    created_at: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface AdminDomainItem {
  id: string;
  domain: string;
  is_default: boolean;
  is_verified: boolean;
  verification_token: string;
  mx_record_status: 'valid' | 'missing' | 'invalid';
  spf_record_status: 'valid' | 'missing' | 'invalid';
  dkim_record_status: 'valid' | 'missing' | 'invalid';
  created_at: string;
}

export interface AdminRoleStaff {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'support_admin' | 'security_admin' | 'billing_admin';
  permissions: string[];
  added_by: string;
  created_at: string;
}

export interface AdminBroadcastItem {
  id: string;
  title: string;
  message: string;
  sender_email: string;
  target: 'all' | 'free' | 'pro' | 'admins';
  sent_at: string;
  recipients_count: number;
}

export interface AdminPaymentItem {
  id: string;
  payment_id: string;
  user_email: string;
  plan_name: string;
  amount_usd: number;
  crypto_currency?: string;
  crypto_amount?: number;
  payment_status: 'waiting' | 'confirming' | 'confirmed' | 'failed' | 'refunded';
  invoice_url?: string;
  created_at: string;
}

export interface AdminSystemHealth {
  serverStatus: 'healthy' | 'degraded' | 'down';
  databaseStatus: 'connected' | 'reconnecting' | 'fallback_active';
  databaseEngine: string;
  apiStatus: 'optimal' | 'warning' | 'error';
  uptimeSeconds: number;
  memoryUsageMb: number;
  cpuLoadPercent: number;
  activeSockets: number;
  smtpStatus: 'connected' | 'not_configured';
  twilioStatus: 'connected' | 'not_configured';
  resendStatus: 'connected' | 'not_configured';
  lastHealthCheck: string;
}

export interface AdminSiteSettings {
  site_name: string;
  site_url: string;
  support_email: string;
  default_domain: string;
  allow_registration: boolean;
  default_storage_bytes: number;
  pro_price_monthly_usd: number;
  pro_price_yearly_usd: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_trial_number: string;
  resend_api_key: string;
  resend_from: string;
  nowpayments_api_key: string;
  nowpayments_ipn_secret: string;
  supabase_url: string;
  supabase_anon_key: string;
}


