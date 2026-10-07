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
  temp_email_id?: string;
  recipient: string;
  to_email?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  sender: string;
  from_email?: string;
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
  two_factor_enabled?: boolean;
  two_factor_secret?: string;
  backup_codes?: string[];
  storage_used_bytes?: number;
  storage_limit_bytes?: number;
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
