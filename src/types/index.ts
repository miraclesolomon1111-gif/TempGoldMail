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
  | 'trash'
  | 'manage_subscriptions';

export interface EmailMessage {
  id: string;
  temp_email_id?: string;
  recipient: string;
  to_email?: string;
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

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  age?: number | string;
  gender?: string;
  country?: string;
  location?: string;
  avatar_url?: string;
  isPremium?: boolean;
  role?: 'user' | 'admin';
  created_at?: string;
  is_banned?: boolean;
}

export interface NowPaymentsInvoice {
  payment_id: string;
  user_id?: string | null;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  payment_status: string;
  email_to_reserve?: string;
  created_at?: string;
  invoice_url?: string;
}
