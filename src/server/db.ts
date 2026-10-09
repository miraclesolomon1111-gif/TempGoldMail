import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types
export interface StoredGoldUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  phone: string;
  recovery_phone?: string;
  backup_email?: string;
  two_factor_enabled: boolean;
  two_factor_secret?: string;
  backup_codes: string[];
  role: 'user' | 'admin';
  created_at: string;
  is_banned: boolean;
  banned_at?: string;
  ban_reason?: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  avatar_url?: string;
  plan?: 'free' | 'pro' | 'business' | 'enterprise';
  plan_billing?: 'monthly' | 'yearly';
  plan_status?: 'active' | 'cancelled' | 'trial' | 'expired';
  reset_token?: string;
  reset_token_expires?: number;
}

export interface StoredEmail {
  id: string;
  messageId?: string;
  user_id?: string;
  recipient: string;
  to_email: string;
  to?: string;
  cc?: string;
  bcc?: string;
  sender: string;
  from_email: string;
  from?: string;
  sender_name?: string;
  subject: string;
  body_html: string;
  body_text: string;
  html?: string;
  text?: string;
  body?: string;
  received_at: string;
  created_at: string;
  is_read: boolean;
  is_starred: boolean;
  folder: string; // 'primary' | 'promotions' | 'social' | 'updates' | 'starred' | 'sent' | 'scheduled' | 'outbox' | 'drafts' | 'all_mail' | 'spam' | 'trash'
  category: 'primary' | 'promotions' | 'social' | 'updates';
  status?: 'inbox' | 'trash' | 'deleted' | 'sent' | 'draft' | 'spam';
  trashed_at?: string;
  scheduled_for?: string;
  raw?: any;
}

export interface StoredSession {
  session_id: string;
  user_id: string;
  email: string;
  token: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
  last_active_at: string;
}

export interface StoredTicket {
  id: string;
  user_id?: string;
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

export interface StoredActivityLog {
  id: string;
  admin_email: string;
  action: string;
  target_type: 'user' | 'email' | 'system' | 'security' | 'payment' | 'domain';
  target_id?: string;
  details: string;
  ip?: string;
  created_at: string;
}

export interface StoredDomain {
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

export interface StoredAdminRole {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'support_admin' | 'security_admin' | 'billing_admin';
  permissions: string[];
  added_by: string;
  created_at: string;
}

export interface StoredBroadcast {
  id: string;
  title: string;
  message: string;
  sender_email: string;
  target: 'all' | 'free' | 'pro' | 'admins';
  sent_at: string;
  recipients_count: number;
}

export interface StoredPayment {
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

export interface StoredSettings {
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

// File persistence paths
const DB_PATHS = [
  path.join(process.cwd(), '.goldmailer_data.json'),
  path.join('/tmp', '.goldmailer_data.json'),
  path.join(process.cwd(), 'goldmailer_db_backup.json')
];

class GoldDatabase {
  private users: StoredGoldUser[] = [];
  private emails: StoredEmail[] = [];
  private deletedEmailIds: Set<string> = new Set();
  private sessions: StoredSession[] = [];
  private tickets: StoredTicket[] = [];
  private activityLogs: StoredActivityLog[] = [];
  private domains: StoredDomain[] = [];
  private adminRoles: StoredAdminRole[] = [];
  private broadcasts: StoredBroadcast[] = [];
  private payments: StoredPayment[] = [];
  private blockedIps: Set<string> = new Set();
  private settings: StoredSettings = {
    site_name: 'GoldMailer',
    site_url: 'https://goldmailer.xyz',
    support_email: 'support@goldmailer.xyz',
    default_domain: 'goldmailer.xyz',
    allow_registration: true,
    default_storage_bytes: 15 * 1024 * 1024 * 1024,
    pro_price_monthly_usd: 4.99,
    pro_price_yearly_usd: 49.99,
    smtp_host: process.env.SMTP_HOST || 'smtp.goldmailer.xyz',
    smtp_port: parseInt(process.env.SMTP_PORT || '587', 10),
    smtp_user: process.env.SMTP_USER || 'postmaster@goldmailer.xyz',
    smtp_pass: process.env.SMTP_PASS || '',
    smtp_secure: process.env.SMTP_SECURE === 'true',
    twilio_account_sid: process.env.TWILIO_ACCOUNT_SID || '',
    twilio_auth_token: process.env.TWILIO_AUTH_TOKEN || '',
    twilio_trial_number: process.env.TWILIO_PHONE_NUMBER || '+1 (737) 250-8034',
    resend_api_key: process.env.RESEND_API_KEY || '',
    resend_from: process.env.RESEND_FROM || 'GoldMailer Security <security@goldmailer.xyz>',
    nowpayments_api_key: process.env.NOWPAYMENTS_API_KEY || '',
    nowpayments_ipn_secret: process.env.NOWPAYMENTS_IPN_SECRET || process.env.IPN_SECRET || '',
    supabase_url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabase_anon_key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  };

  private supabase: SupabaseClient | null = null;
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.initSupabase();
    this.loadFromDisk();
    this.seedDefaultData();
    this.startTrashCleanerCron();
  }

  private initSupabase() {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      try {
        this.supabase = createClient(url, key);
        console.log('✅ Supabase client initialized for GoldMailer DB persistence');
      } catch (err) {
        console.warn('⚠️ Supabase init warning:', err);
      }
    }
  }

  // Atomic file save to prevent corruption or truncated files
  public saveToDiskSync() {
    try {
      let existingExtra: Record<string, any> = {};
      for (const targetPath of DB_PATHS) {
        try {
          if (fs.existsSync(targetPath)) {
            const raw = fs.readFileSync(targetPath, 'utf-8');
            existingExtra = JSON.parse(raw);
            break;
          }
        } catch {}
      }

      const data = {
        ...existingExtra,
        users: this.users,
        goldUsers: this.users,
        emails: this.emails,
        goldEmails: this.emails,
        deletedEmailIds: Array.from(this.deletedEmailIds),
        sessions: this.sessions,
        tickets: this.tickets,
        activityLogs: this.activityLogs.slice(-500),
        domains: this.domains,
        adminRoles: this.adminRoles.filter(r => r.email?.toLowerCase().trim() === 'miracle@goldmailer.xyz'),
        broadcasts: this.broadcasts,
        payments: this.payments,
        blockedIps: Array.from(this.blockedIps),
        settings: this.settings,
        saved_at: new Date().toISOString()
      };
      const json = JSON.stringify(data, null, 2);

      for (const targetPath of DB_PATHS) {
        try {
          const dir = path.dirname(targetPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          const tempPath = `${targetPath}.tmp.${Date.now()}`;
          fs.writeFileSync(tempPath, json, 'utf-8');
          fs.renameSync(tempPath, targetPath);
        } catch (fileErr) {
          // ignore single path error
        }
      }
    } catch (e) {
      console.error('❌ Error saving database to disk:', e);
    }
  }

  public scheduleDiskSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDiskSync();
    }, 100);
  }

  public loadFromDisk() {
    let freshestData: any = null;
    let freshestMtime = -1;

    for (const targetPath of DB_PATHS) {
      try {
        if (fs.existsSync(targetPath)) {
          const stat = fs.statSync(targetPath);
          if (stat.mtimeMs > freshestMtime && stat.size > 20) {
            const raw = fs.readFileSync(targetPath, 'utf-8');
            const parsed = JSON.parse(raw);
            freshestMtime = stat.mtimeMs;
            freshestData = parsed;
          }
        }
      } catch (err) {
        // try next
      }
    }

    if (freshestData) {
      const rawUsers = Array.isArray(freshestData.users) && freshestData.users.length > 0
        ? freshestData.users
        : (Array.isArray(freshestData.goldUsers) ? freshestData.goldUsers : []);
      if (rawUsers.length > 0) {
        this.users = rawUsers.map((u: any) => {
          const cleanUser = (u.username || (u.email || '').split('@')[0] || '').toLowerCase().trim();
          const fixedEmail = cleanUser ? `${cleanUser}@goldmailer.xyz` : (u.email || '');
          return {
            ...u,
            email: fixedEmail,
            is_banned: Boolean(u.is_banned),
            banned_at: u.banned_at || (u.is_banned ? new Date().toISOString() : undefined)
          };
        });
      }
      if (Array.isArray(freshestData.deletedEmailIds)) {
        for (const did of freshestData.deletedEmailIds) {
          this.deletedEmailIds.add(did);
        }
      }
      const rawEmails = Array.isArray(freshestData.emails) && freshestData.emails.length > 0
        ? freshestData.emails
        : (Array.isArray(freshestData.goldEmails) ? freshestData.goldEmails : []);
      if (rawEmails.length > 0) {
        const loadedList = rawEmails
          .filter((e: any) => e && e.status !== 'deleted' && !this.deletedEmailIds.has(e.id))
          .map((e: any) => ({
            ...e,
            status: e.status || (e.folder === 'trash' ? 'trash' : 'inbox'),
            folder: e.folder || 'primary'
          }));
        this.emails = this.deduplicateStoredEmails(loadedList);
      }
      if (Array.isArray(freshestData.sessions)) {
        this.sessions = freshestData.sessions;
      }
      if (Array.isArray(freshestData.tickets)) {
        this.tickets = freshestData.tickets.filter((t: any) => t.id !== 'tkt_001');
      }
      if (Array.isArray(freshestData.activityLogs)) {
        this.activityLogs = freshestData.activityLogs;
      }
      if (Array.isArray(freshestData.domains)) {
        this.domains = freshestData.domains.filter((d: any) => d.domain === 'goldmailer.xyz' || !d.domain.startsWith('goldmailer.'));
      }
      if (Array.isArray(freshestData.adminRoles)) {
        this.adminRoles = freshestData.adminRoles.filter((r: any) => r.email?.toLowerCase().trim() === 'miracle@goldmailer.xyz');
      }
      if (Array.isArray(freshestData.broadcasts)) {
        this.broadcasts = freshestData.broadcasts;
      }
      if (Array.isArray(freshestData.payments)) {
        this.payments = freshestData.payments.filter((p: any) => p.id !== 'pay_001');
      }
      if (Array.isArray(freshestData.blockedIps)) {
        this.blockedIps = new Set(freshestData.blockedIps);
      }
      if (freshestData.settings && typeof freshestData.settings === 'object') {
        this.settings = {
          ...this.settings,
          ...freshestData.settings,
          site_url: 'https://goldmailer.xyz',
          support_email: 'support@goldmailer.xyz',
          default_domain: 'goldmailer.xyz',
          smtp_host: freshestData.settings.smtp_host || process.env.SMTP_HOST || 'smtp.goldmailer.xyz',
          smtp_user: freshestData.settings.smtp_user || process.env.SMTP_USER || 'postmaster@goldmailer.xyz',
          resend_from: process.env.RESEND_FROM || 'GoldMailer Security <security@goldmailer.xyz>'
        };
      }
      console.log(`✅ Loaded GoldMailer DB from disk: ${this.users.length} accounts, ${this.emails.length} emails`);
    }

    this.isLoaded = true;
  }

  public findAccountSync(identifier: string): StoredGoldUser | null {
    if (!identifier) return null;
    const clean = identifier.toLowerCase().trim();
    const userPart = clean.replace(/@.*$/, '');
    return this.users.find(u => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUser = (u.username || '').toLowerCase().trim();
      const uBackup = (u.backup_email || '').toLowerCase().trim();
      return (
        u.id === identifier ||
        (u.id || '').toLowerCase() === clean ||
        uEmail === clean ||
        uUser === clean ||
        uBackup === clean ||
        uUser === userPart ||
        uEmail === `${userPart}@goldmailer.xyz`
      );
    }) || null;
  }

  public deduplicateStoredEmails(list: StoredEmail[]): StoredEmail[] {
    const seenIds = new Set<string>();
    const seenFingerprints = new Set<string>();
    const result: StoredEmail[] = [];

    for (const em of list) {
      if (!em || !em.id) continue;
      if (this.deletedEmailIds.has(em.id) || em.status === 'deleted') continue;
      if (seenIds.has(em.id)) continue;
      seenIds.add(em.id);

      const msgId = (em as any).messageId || em.raw?.messageId;
      const fingerprint = msgId
        ? `msgid:${msgId}`
        : `${(em.from_email || em.sender || '').toLowerCase()}|${(em.to_email || em.recipient || '').toLowerCase()}|${(em.subject || '').trim().toLowerCase()}|${(em.received_at || em.created_at || '').slice(0, 16)}`;

      if (fingerprint && seenFingerprints.has(fingerprint)) continue;
      if (fingerprint) seenFingerprints.add(fingerprint);

      result.push(em);
    }
    return result;
  }

  // Seed default permanent active accounts without overriding their ban status if banned!
  private seedDefaultData() {
    const defaultPasswordHash = bcrypt.hashSync('@654413Mm', 10);

    const defaultAccounts = [
      {
        id: 'usr_miracle_01',
        email: 'miracle@goldmailer.xyz',
        username: 'miracle',
        first_name: 'Miracle',
        last_name: 'Solomon',
        dob: '1998-05-14',
        gender: 'Male',
        phone: '+234 801 234 5678',
        recovery_phone: '+234 801 234 5678',
        backup_email: 'miracle.backup@gmail.com',
        role: 'admin' as const,
        plan: 'enterprise' as const
      },
      {
        id: 'usr_doris_01',
        email: 'dorisokoh109@goldmailer.xyz',
        username: 'dorisokoh109',
        first_name: 'Doris',
        last_name: 'Okoh',
        dob: '1999-07-22',
        gender: 'Female',
        phone: '+1 555 019 2834',
        recovery_phone: '+1 555 019 2834',
        backup_email: 'dorisokoh109@gmail.com',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_admin_01',
        email: 'admin@goldmailer.xyz',
        username: 'admin',
        first_name: 'System',
        last_name: 'Administrator',
        dob: '1995-01-01',
        gender: 'Not specified',
        phone: '+1 267 230 1662',
        recovery_phone: '+1 267 230 1662',
        backup_email: 'admin.backup@goldmailer.xyz',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_support_01',
        email: 'support@goldmailer.xyz',
        username: 'support',
        first_name: 'Support',
        last_name: 'Desk',
        dob: '1996-03-15',
        gender: 'Not specified',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_team_01',
        email: 'team@goldmailer.xyz',
        username: 'team',
        first_name: 'GoldMailer',
        last_name: 'Team',
        dob: '1997-06-20',
        gender: 'Not specified',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_security_01',
        email: 'security@goldmailer.xyz',
        username: 'security',
        first_name: 'Security',
        last_name: 'Officer',
        dob: '1995-11-11',
        gender: 'Not specified',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_alex_01',
        email: 'alex@goldmailer.xyz',
        username: 'alex',
        first_name: 'Alex',
        last_name: 'Morgan',
        dob: '1999-04-18',
        gender: 'Male',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'pro' as const
      },
      {
        id: 'usr_sarah_01',
        email: 'sarah@goldmailer.xyz',
        username: 'sarah',
        first_name: 'Sarah',
        last_name: 'Jenkins',
        dob: '2000-08-09',
        gender: 'Female',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_david_01',
        email: 'david@goldmailer.xyz',
        username: 'david',
        first_name: 'David',
        last_name: 'Chen',
        dob: '1998-12-03',
        gender: 'Male',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      },
      {
        id: 'usr_emma_01',
        email: 'emma@goldmailer.xyz',
        username: 'emma',
        first_name: 'Emma',
        last_name: 'Watson',
        dob: '2001-02-14',
        gender: 'Female',
        phone: '',
        recovery_phone: '',
        backup_email: '',
        role: 'user' as const,
        plan: 'free' as const
      }
    ];

    let hasChanges = false;
    for (const def of defaultAccounts) {
      const existing = this.users.find(
        u => u.id === def.id ||
             u.username.toLowerCase() === def.username.toLowerCase() ||
             u.email.toLowerCase() === def.email.toLowerCase()
      );

      if (!existing) {
        this.users.push({
          ...def,
          password_hash: defaultPasswordHash,
          two_factor_enabled: false,
          backup_codes: this.generateBackupCodes(),
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          is_banned: false,
          storage_used_bytes: 0,
          storage_limit_bytes: 15 * 1024 * 1024 * 1024,
          plan_billing: 'yearly',
          plan_status: 'active'
        });
        hasChanges = true;
      } else {
        if (existing.email !== def.email) {
          existing.email = def.email;
          hasChanges = true;
        }
      }
    }

    // Enforce admin access: ONLY miracle@goldmailer.xyz is admin! All other emails are regular user!
    for (const u of this.users) {
      if (u.email?.toLowerCase().trim() !== 'miracle@goldmailer.xyz') {
        if (u.role === 'admin') {
          u.role = 'user';
          hasChanges = true;
        }
      } else {
        if (u.role !== 'admin') {
          u.role = 'admin';
          hasChanges = true;
        }
      }
    }

    const prevAdminRolesCount = this.adminRoles.length;
    this.adminRoles = this.adminRoles.filter(r => r.email?.toLowerCase().trim() === 'miracle@goldmailer.xyz');
    if (this.adminRoles.length !== prevAdminRolesCount) {
      hasChanges = true;
    }

    // Primary and default domain is exclusively goldmailer.xyz
    if (!this.domains.some(d => d.domain === 'goldmailer.xyz')) {
      this.domains.unshift({
        id: 'dom_01',
        domain: 'goldmailer.xyz',
        is_default: true,
        is_verified: true,
        verification_token: 'v=goldmailer-verify-primary-xyz',
        mx_record_status: 'valid',
        spf_record_status: 'valid',
        dkim_record_status: 'valid',
        created_at: new Date().toISOString()
      });
      hasChanges = true;
    } else {
      const xyzDom = this.domains.find(d => d.domain === 'goldmailer.xyz');
      if (xyzDom && !xyzDom.is_default) {
        xyzDom.is_default = true;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveToDiskSync();
    }
  }

  // Cron: auto-delete emails trashed over 30 days ago
  private startTrashCleanerCron() {
    setInterval(() => {
      this.purgeExpiredTrash();
    }, 60 * 60 * 1000); // Check hourly
  }

  public purgeExpiredTrash(): number {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let purgedCount = 0;

    for (const email of this.emails) {
      if (email.status === 'trash' && email.trashed_at) {
        const trashedTime = new Date(email.trashed_at).getTime();
        if (trashedTime < thirtyDaysAgo) {
          email.status = 'deleted';
          purgedCount++;
        }
      }
    }

    if (purgedCount > 0) {
      console.log(`🧹 [Cron] Auto-purged ${purgedCount} expired trashed emails older than 30 days`);
      this.scheduleDiskSave();
    }
    return purgedCount;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  // ================= USER & ACCOUNT OPERATIONS =================

  public async findAccount(identifier: string): Promise<StoredGoldUser | null> {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const cleanNoAt = clean.replace(/^@+/, '');
    const userPart = cleanNoAt.replace(/@.*$/, '');
    const userPartNoDots = userPart.replace(/\./g, '');

    console.log(`🔍 DB QUERY goldmailer_accounts for login/lookup: "${identifier}"`);

    // Memory / Local Disk first
    const found = this.users.find(u => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUser = (u.username || '').toLowerCase().trim();
      const uBackup = (u.backup_email || '').toLowerCase().trim();

      const uEmailUserPart = uEmail.replace(/@.*$/, '');
      const uEmailNoDots = uEmailUserPart.replace(/\./g, '');
      const uUserNoDots = uUser.replace(/\./g, '');

      return (
        u.id === identifier ||
        (u.id || '').toLowerCase() === clean ||
        uEmail === clean ||
        uUser === clean ||
        uBackup === clean ||
        uEmailUserPart === userPart ||
        uUser === userPart ||
        uEmail === `${userPart}@goldmailer.xyz` ||
        uEmailNoDots === userPartNoDots ||
        uUserNoDots === userPartNoDots
      );
    });

    if (found) {
      return found;
    }

    // Try Supabase if configured
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('goldmailer_accounts')
          .select('*')
          .or(`email.ilike.${clean},username.ilike.${userPart}`)
          .limit(1);

        if (!error && data && data.length > 0) {
          const row = data[0];
          console.log(`✅ DB QUERY found account in Supabase: ${row.email}`);
          // Sync into local memory
          this.users.push(row);
          this.scheduleDiskSave();
          return row;
        }
      } catch (sbErr) {
        console.warn('Supabase query note:', sbErr);
      }
    }

    return null;
  }

  public async insertAccount(user: StoredGoldUser): Promise<StoredGoldUser> {
    console.log(`✅ DB INSERT goldmailer_accounts: ${user.email} (username: ${user.username})`);

    // Ensure email and username are clean
    const cleanEmail = user.email.toLowerCase().trim();
    const cleanUser = user.username.toLowerCase().trim();

    // Check for duplicate
    const existing = await this.findAccount(cleanUser);
    if (existing) {
      throw new Error(`Username or email @${cleanUser} already registered`);
    }

    // Add to memory
    this.users.unshift(user);
    this.saveToDiskSync();

    // Try insert to Supabase
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('goldmailer_accounts')
          .insert([user]);
        if (error) {
          console.warn('⚠️ Supabase insert warning (saved locally):', error.message);
        } else {
          console.log(`✅ Supabase INSERT goldmailer_accounts confirmed: ${user.email}`);
        }
      } catch (sbErr) {
        console.warn('Supabase insert note:', sbErr);
      }
    }

    return user;
  }

  public async updateAccount(id: string, updates: Partial<StoredGoldUser>): Promise<StoredGoldUser | null> {
    const idx = this.users.findIndex(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
    if (idx === -1) return null;

    this.users[idx] = { ...this.users[idx], ...updates };
    const updated = this.users[idx];

    console.log(`✅ DB UPDATE goldmailer_accounts: ${updated.email}`, updates);
    this.saveToDiskSync();

    // Sync to Supabase
    if (this.supabase) {
      try {
        await this.supabase
          .from('goldmailer_accounts')
          .update(updates)
          .eq('id', updated.id);
      } catch (sbErr) {
        console.warn('Supabase update note:', sbErr);
      }
    }

    return updated;
  }

  public upsertAccount(user: StoredGoldUser): StoredGoldUser {
    const cleanEmail = (user.email || '').toLowerCase().trim();
    const cleanUser = (user.username || cleanEmail.split('@')[0] || '').toLowerCase().trim();
    const enforcedRole = cleanEmail === 'miracle@goldmailer.xyz' ? 'admin' : 'user';
    const idx = this.users.findIndex(
      u => (user.id && u.id === user.id) ||
           u.email.toLowerCase() === cleanEmail ||
           (cleanUser && u.username.toLowerCase() === cleanUser)
    );
    if (idx !== -1) {
      this.users[idx] = { ...this.users[idx], ...user, email: cleanEmail, role: enforcedRole };
      return this.users[idx];
    } else {
      const formatted: StoredGoldUser = {
        ...user,
        email: cleanEmail,
        username: cleanUser,
        role: enforcedRole,
        is_banned: Boolean(user.is_banned),
        storage_used_bytes: user.storage_used_bytes || 0,
        storage_limit_bytes: user.storage_limit_bytes || 15 * 1024 * 1024 * 1024
      };
      this.users.unshift(formatted);
      this.scheduleDiskSave();
      return formatted;
    }
  }

  public async setBanStatus(
    userIdOrEmail: string,
    isBanned: boolean,
    reason?: string,
    adminEmail?: string
  ): Promise<StoredGoldUser | null> {
    const user = await this.findAccount(userIdOrEmail);
    if (!user) return null;

    user.is_banned = isBanned;
    user.banned_at = isBanned ? new Date().toISOString() : undefined;
    if (reason) user.ban_reason = reason;

    console.log(`✅ DB UPDATE goldmailer_accounts BAN STATUS: ${user.email} -> is_banned=${isBanned}, banned_at=${user.banned_at}`);
    this.saveToDiskSync();

    // Sync to Supabase
    if (this.supabase) {
      try {
        await this.supabase
          .from('goldmailer_accounts')
          .update({
            is_banned: user.is_banned,
            banned_at: user.banned_at,
            ban_reason: user.ban_reason
          })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Supabase ban update note:', err);
      }
    }

    // Log admin activity
    await this.logAdminActivity(
      adminEmail || 'admin@goldmailer.xyz',
      isBanned ? 'BAN_USER' : 'UNBAN_USER',
      'user',
      user.id,
      `${isBanned ? 'Banned' : 'Unbanned'} user ${user.email}. Reason: ${reason || 'No reason specified'}`
    );

    return user;
  }

  public async deleteAccount(userIdOrEmail: string, adminEmail?: string): Promise<boolean> {
    const user = await this.findAccount(userIdOrEmail);
    if (!user) return false;

    console.log(`🗑️ DB DELETE goldmailer_accounts: ${user.email}`);
    this.users = this.users.filter(u => u.id !== user.id && u.email.toLowerCase() !== user.email.toLowerCase());
    
    // Mark user's emails as deleted
    for (const e of this.emails) {
      if (e.recipient.toLowerCase().includes(user.email.toLowerCase()) || e.to_email.toLowerCase().includes(user.email.toLowerCase())) {
        e.status = 'deleted';
      }
    }

    this.saveToDiskSync();

    if (this.supabase) {
      try {
        await this.supabase.from('goldmailer_accounts').delete().eq('id', user.id);
      } catch {}
    }

    await this.logAdminActivity(
      adminEmail || 'admin@goldmailer.xyz',
      'DELETE_USER',
      'user',
      user.id,
      `Permanently deleted account ${user.email}`
    );

    return true;
  }

  public listAccounts(): StoredGoldUser[] {
    return this.users;
  }

  public getAllAccounts(): StoredGoldUser[] {
    return this.users;
  }

  // ================= EMAIL & TRASH OPERATIONS =================

  public isEmailDeleted(id: string): boolean {
    return this.deletedEmailIds.has(id);
  }

  public async insertEmail(email: StoredEmail): Promise<StoredEmail> {
    // If permanently deleted, NEVER insert back
    if (this.deletedEmailIds.has(email.id) || email.status === 'deleted') {
      return email;
    }
    const msgId = (email as any).messageId || email.raw?.messageId;
    if (msgId && this.deletedEmailIds.has(msgId)) {
      return email;
    }

    // Default status to inbox unless sent or draft
    if (!email.status) {
      email.status = email.folder === 'sent' ? 'sent' : email.folder === 'drafts' ? 'draft' : 'inbox';
    }

    console.log(`✅ DB INSERT goldmailer_emails: ID=${email.id}, To=${email.recipient}, Status=${email.status}`);

    // Deduplication check: Match by ID, Message-ID header, or sender + subject within time window
    const targetMsgId = ((email as any).messageId || email.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
    const targetFrom = (email.from_email || email.sender || '').trim().toLowerCase();
    const targetTo = (email.to_email || email.recipient || '').trim().toLowerCase();
    const targetSub = (email.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
    const targetTime = new Date(email.received_at || email.created_at || 0).getTime();
    const targetBodyLen = (email.body_text || email.text || email.body || '').replace(/<[^>]+>/g, '').trim().length;

    const existingIdx = this.emails.findIndex(e => {
      if (e.id === email.id) return true;

      const eMsgId = ((e as any).messageId || e.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
      if (targetMsgId && eMsgId && targetMsgId === eMsgId) return true;

      const eFrom = (e.from_email || e.sender || '').trim().toLowerCase();
      const eTo = (e.to_email || e.recipient || '').trim().toLowerCase();
      const eSub = (e.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');

      const sameSender = targetFrom === eFrom || (targetFrom && eFrom && targetFrom.split('@')[0] === eFrom.split('@')[0]);
      const sameTo = !targetTo || !eTo || targetTo === eTo || targetTo.split('@')[0] === eTo.split('@')[0];

      if (sameSender && sameTo && targetSub === eSub) {
        const eTime = new Date(e.received_at || e.created_at || 0).getTime();
        const timeDiff = Math.abs(targetTime - eTime);

        // Within 2 hours: definitely the same incoming email transmission
        if (timeDiff <= 2 * 60 * 60 * 1000) return true;

        // If one has empty body and one has content within 24 hours: same email
        const eBodyLen = (e.body_text || e.text || e.body || '').replace(/<[^>]+>/g, '').trim().length;
        if ((targetBodyLen === 0 || eBodyLen === 0) && timeDiff <= 24 * 60 * 60 * 1000) return true;

        // Or if body snippet is identical
        const tSnip = (email.body_text || email.text || email.body || '').slice(0, 50).trim();
        const eSnip = (e.body_text || e.text || e.body || '').slice(0, 50).trim();
        if (tSnip && eSnip && tSnip === eSnip) return true;
      }

      return false;
    });

    if (existingIdx !== -1) {
      const existing = this.emails[existingIdx];
      const existingBodyLen = (existing.body_text || existing.text || existing.body || '').replace(/<[^>]+>/g, '').trim().length;

      // If new email has content and existing was empty, or new has longer body, upgrade content
      if (targetBodyLen >= existingBodyLen) {
        this.emails[existingIdx] = {
          ...existing,
          ...email,
          // Preserve read/star states if existing was marked
          is_read: existing.is_read || email.is_read,
          is_starred: existing.is_starred || email.is_starred
        };
      } else {
        // Existing already had better content, just retain existing but merge IDs if helpful
        this.emails[existingIdx] = {
          ...email,
          ...existing,
          messageId: email.messageId || existing.messageId
        };
      }
      console.log(`✅ DB DEDUPED email ${email.id} into existing entry ${existing.id}`);
    } else {
      this.emails.unshift(email);
    }

    this.scheduleDiskSave();

    if (this.supabase) {
      try {
        await this.supabase.from('goldmailer_emails').upsert([email]);
      } catch {}
    }

    return email;
  }

  public async getEmailById(id: string): Promise<StoredEmail | null> {
    if (this.deletedEmailIds.has(id)) return null;
    return this.emails.find(e => e.id === id && e.status !== 'deleted') || null;
  }

  public deleteEmail(id: string): boolean {
    this.deletedEmailIds.add(id);
    const email = this.emails.find(e => e.id === id);
    if ((email as any)?.messageId) this.deletedEmailIds.add((email as any).messageId);
    if (email?.raw?.messageId) this.deletedEmailIds.add(email.raw.messageId);
    const initialLen = this.emails.length;
    this.emails = this.emails.filter(e => e.id !== id);
    this.saveToDiskSync();
    return this.emails.length < initialLen;
  }

  public async updateEmailStatus(
    id: string,
    status: 'inbox' | 'trash' | 'deleted' | 'sent' | 'spam',
    folder?: string
  ): Promise<StoredEmail | null> {
    if (status === 'deleted') {
      const email = this.emails.find(e => e.id === id);
      this.deletedEmailIds.add(id);
      if ((email as any)?.messageId) this.deletedEmailIds.add((email as any).messageId);
      if (email?.raw?.messageId) this.deletedEmailIds.add(email.raw.messageId);
      this.emails = this.emails.filter(e => e.id !== id);
      this.saveToDiskSync();
      console.log(`✅ DB UPDATE email permanently deleted and purged from DB: ${id}`);
      return email || null;
    }

    const email = this.emails.find(e => e.id === id);
    if (!email) return null;

    email.status = status;
    if (folder) email.folder = folder;
    else if (status === 'trash') email.folder = 'trash';
    else if (status === 'inbox') email.folder = 'primary';

    if (status === 'trash') {
      email.trashed_at = new Date().toISOString();
      console.log(`✅ DB UPDATE email status to trash: ${id} (trashed_at: ${email.trashed_at})`);
    } else if (status === 'inbox') {
      email.trashed_at = undefined;
      this.deletedEmailIds.delete(id);
      console.log(`✅ DB UPDATE email status to inbox (restored): ${id}`);
    }

    this.saveToDiskSync();

    if (this.supabase) {
      try {
        await this.supabase
          .from('goldmailer_emails')
          .update({
            status: email.status,
            folder: email.folder,
            trashed_at: email.trashed_at
          })
          .eq('id', email.id);
      } catch {}
    }

    return email;
  }

  public async batchUpdateEmailStatus(
    ids: string[],
    status: 'inbox' | 'trash' | 'deleted'
  ): Promise<number> {
    const idSet = new Set(ids);
    let count = 0;

    if (status === 'deleted') {
      for (const id of ids) {
        this.deletedEmailIds.add(id);
        const email = this.emails.find(e => e.id === id);
        if ((email as any)?.messageId) this.deletedEmailIds.add((email as any).messageId);
        if (email?.raw?.messageId) this.deletedEmailIds.add(email.raw.messageId);
      }
      this.emails = this.emails.filter(e => !idSet.has(e.id));
      this.saveToDiskSync();
      console.log(`✅ DB BATCH permanent delete purged ${ids.length} emails from DB`);
      return ids.length;
    }

    for (const email of this.emails) {
      if (idSet.has(email.id)) {
        email.status = status;
        if (status === 'trash') {
          email.folder = 'trash';
          email.trashed_at = new Date().toISOString();
        } else if (status === 'inbox') {
          email.folder = 'primary';
          email.trashed_at = undefined;
          this.deletedEmailIds.delete(email.id);
        }
        count++;
      }
    }

    console.log(`✅ DB BATCH UPDATE email status to ${status} for ${count} emails`);
    this.saveToDiskSync();
    return count;
  }

  public getEmailsForUser(targetEmail: string, folder?: string): StoredEmail[] {
    const cleanTarget = targetEmail.trim().toLowerCase();
    const cleanUserPart = cleanTarget.replace(/@.*$/, '');

    return this.emails.filter(e => {
      // Must match recipient or sender
      const to = (e.recipient || e.to_email || e.to || '').toLowerCase();
      const from = (e.sender || e.from_email || e.from || '').toLowerCase();

      const isTo = to.includes(cleanTarget) || to.includes(cleanUserPart);
      const isFrom = from.includes(cleanTarget) || from.includes(cleanUserPart);

      if (!isTo && !isFrom) return false;

      // HARD FILTER: Status check
      if (e.status === 'deleted') return false;

      // Trash folder: ONLY show status === 'trash'
      if (folder === 'trash') {
        return e.status === 'trash' || e.folder === 'trash';
      }

      // If viewing regular inbox / folders: NEVER show trashed emails!
      if (e.status === 'trash' || e.folder === 'trash') {
        return false;
      }

      if (folder === 'sent') {
        return isFrom && (e.status === 'sent' || e.folder === 'sent');
      }

      if (folder === 'starred') {
        return Boolean(e.is_starred);
      }

      if (folder === 'spam') {
        return e.status === 'spam' || e.folder === 'spam';
      }

      if (folder === 'all_mail' || folder === 'all' || folder === 'all_inboxes') {
        return true;
      }

      // Primary / inbox view
      return e.status === 'inbox' || !e.status || e.folder === 'primary';
    });
  }

  public getAllEmails(): StoredEmail[] {
    return this.emails;
  }

  // ================= SESSION & MULTI-ACCOUNT OPERATIONS =================

  public async createSession(session: StoredSession): Promise<StoredSession> {
    console.log(`✅ DB INSERT goldmailer_sessions: user=${session.email}, session_id=${session.session_id}`);
    
    // Remove old session with same ID or update
    this.sessions = this.sessions.filter(s => s.session_id !== session.session_id);
    this.sessions.unshift(session);
    this.scheduleDiskSave();

    if (this.supabase) {
      try {
        await this.supabase.from('goldmailer_sessions').upsert([session]);
      } catch {}
    }

    return session;
  }

  public async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.find(s => s.session_id === sessionId) || null;
  }

  public async getSessionsForUser(email: string): Promise<StoredSession[]> {
    const clean = email.toLowerCase().trim();
    return this.sessions.filter(s => s.email.toLowerCase() === clean);
  }

  public async updateSessionActivity(sessionId: string): Promise<void> {
    const sess = this.sessions.find(s => s.session_id === sessionId);
    if (sess) {
      sess.last_active_at = new Date().toISOString();
      this.scheduleDiskSave();
    }
  }

  public async removeSession(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter(s => s.session_id !== sessionId);
    this.scheduleDiskSave();
    if (this.supabase) {
      try {
        await this.supabase.from('goldmailer_sessions').delete().eq('session_id', sessionId);
      } catch {}
    }
  }

  // ================= ADMIN ACTIVITY LOGS =================

  public async logAdminActivity(
    adminEmail: string,
    action: string,
    targetType: StoredActivityLog['target_type'],
    targetId: string | undefined,
    details: string,
    ip?: string
  ): Promise<StoredActivityLog> {
    const log: StoredActivityLog = {
      id: 'log_' + crypto.randomBytes(6).toString('hex'),
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip: ip || '127.0.0.1',
      created_at: new Date().toISOString()
    };

    console.log(`📝 [Admin Audit] ${action} by ${adminEmail}: ${details}`);
    this.activityLogs.unshift(log);
    this.scheduleDiskSave();

    if (this.supabase) {
      try {
        await this.supabase.from('goldmailer_activity_logs').insert([log]);
      } catch {}
    }

    return log;
  }

  public getActivityLogs(limit = 100): StoredActivityLog[] {
    return this.activityLogs.slice(0, limit);
  }

  // ================= SUPPORT TICKETS =================

  public async createTicket(
    userEmail: string,
    subject: string,
    category: StoredTicket['category'],
    priority: StoredTicket['priority'],
    messageContent: string,
    userName?: string
  ): Promise<StoredTicket> {
    const ticket: StoredTicket = {
      id: 'tkt_' + crypto.randomBytes(5).toString('hex'),
      user_email: userEmail,
      user_name: userName || userEmail.split('@')[0],
      subject,
      category,
      priority,
      status: 'open',
      messages: [
        {
          id: 'msg_' + crypto.randomBytes(4).toString('hex'),
          sender_email: userEmail,
          sender_name: userName || userEmail.split('@')[0],
          is_admin: false,
          content: messageContent,
          created_at: new Date().toISOString()
        }
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.tickets.unshift(ticket);
    this.saveToDiskSync();
    return ticket;
  }

  public async replyToTicket(
    ticketId: string,
    senderEmail: string,
    senderName: string,
    isAdmin: boolean,
    content: string,
    newStatus?: StoredTicket['status']
  ): Promise<StoredTicket | null> {
    const ticket = this.tickets.find(t => t.id === ticketId);
    if (!ticket) return null;

    ticket.messages.push({
      id: 'msg_' + crypto.randomBytes(4).toString('hex'),
      sender_email: senderEmail,
      sender_name: senderName,
      is_admin: isAdmin,
      content,
      created_at: new Date().toISOString()
    });

    if (newStatus) {
      ticket.status = newStatus;
    } else if (isAdmin && ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    ticket.updated_at = new Date().toISOString();
    this.saveToDiskSync();
    return ticket;
  }

  public getTickets(): StoredTicket[] {
    return this.tickets;
  }

  // ================= DOMAINS =================

  public getDomains(): StoredDomain[] {
    return this.domains;
  }

  public async addDomain(domainName: string): Promise<StoredDomain> {
    const clean = domainName.trim().toLowerCase();
    const existing = this.domains.find(d => d.domain.toLowerCase() === clean);
    if (existing) return existing;

    const newDom: StoredDomain = {
      id: 'dom_' + crypto.randomBytes(4).toString('hex'),
      domain: clean,
      is_default: false,
      is_verified: false,
      verification_token: `goldmailer-verify-${crypto.randomBytes(8).toString('hex')}`,
      mx_record_status: 'missing',
      spf_record_status: 'missing',
      dkim_record_status: 'missing',
      created_at: new Date().toISOString()
    };

    this.domains.push(newDom);
    this.saveToDiskSync();
    return newDom;
  }

  public async verifyDomain(id: string): Promise<StoredDomain | null> {
    const dom = this.domains.find(d => d.id === id);
    if (!dom) return null;

    dom.is_verified = true;
    dom.mx_record_status = 'valid';
    dom.spf_record_status = 'valid';
    dom.dkim_record_status = 'valid';
    this.saveToDiskSync();
    return dom;
  }

  public async deleteDomain(id: string): Promise<boolean> {
    const dom = this.domains.find(d => d.id === id);
    if (!dom || dom.is_default) return false;

    this.domains = this.domains.filter(d => d.id !== id);
    this.saveToDiskSync();
    return true;
  }

  // ================= SETTINGS =================

  public getSettings(): StoredSettings {
    return this.settings;
  }

  public async updateSettings(updates: Partial<StoredSettings>): Promise<StoredSettings> {
    this.settings = {
      ...this.settings,
      ...updates,
      default_domain: 'goldmailer.xyz',
      site_url: 'https://goldmailer.xyz',
      support_email: 'support@goldmailer.xyz'
    };
    this.saveToDiskSync();
    return this.settings;
  }

  // ================= ADMIN ROLES =================

  public getAdminRoles(): StoredAdminRole[] {
    return this.adminRoles.filter(r => r.email?.toLowerCase().trim() === 'miracle@goldmailer.xyz');
  }

  public async addAdminRole(
    email: string,
    name: string,
    role: StoredAdminRole['role'],
    permissions: string[],
    addedBy: string
  ): Promise<StoredAdminRole> {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== 'miracle@goldmailer.xyz') {
      throw new Error('Only miracle@goldmailer.xyz can be assigned admin privileges');
    }

    const newRole: StoredAdminRole = {
      id: 'role_' + crypto.randomBytes(4).toString('hex'),
      email: cleanEmail,
      name,
      role: 'super_admin',
      permissions,
      added_by: addedBy,
      created_at: new Date().toISOString()
    };

    this.adminRoles = this.adminRoles.filter(r => r.email?.toLowerCase().trim() === 'miracle@goldmailer.xyz');
    this.adminRoles.push(newRole);
    // Also elevate user in accounts table if exists
    const user = await this.findAccount(cleanEmail);
    if (user) {
      user.role = 'admin';
    }
    this.saveToDiskSync();
    return newRole;
  }

  public async removeAdminRole(id: string): Promise<boolean> {
    this.adminRoles = this.adminRoles.filter(r => r.id !== id);
    this.saveToDiskSync();
    return true;
  }

  // ================= BROADCAST NOTIFICATIONS =================

  public getBroadcasts(): StoredBroadcast[] {
    return this.broadcasts;
  }

  public async createBroadcast(
    title: string,
    message: string,
    senderEmail: string,
    target: StoredBroadcast['target'] = 'all'
  ): Promise<StoredBroadcast> {
    const activeUsers = this.users.filter(u => !u.is_banned);
    const broadcast: StoredBroadcast = {
      id: 'bc_' + crypto.randomBytes(4).toString('hex'),
      title,
      message,
      sender_email: senderEmail,
      target,
      sent_at: new Date().toISOString(),
      recipients_count: activeUsers.length
    };

    this.broadcasts.unshift(broadcast);

    // Deliver broadcast announcement as inbox email to each user
    for (const u of activeUsers) {
      await this.insertEmail({
        id: `bc_email_${broadcast.id}_${u.id}`,
        recipient: u.email,
        to_email: u.email,
        sender: `GoldMailer Announcements <${senderEmail}>`,
        from_email: senderEmail,
        sender_name: 'GoldMailer Admin',
        subject: `📢 Announcement: ${title}`,
        body_html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; max-width: 600px; padding: 24px; border-radius: 12px; border: 1px solid #FF6A00; background: #fff; color: #222;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-weight: 800; color: #FF6A00; font-size: 20px;">GoldMailer Official Broadcast</span>
            </div>
            <h2 style="margin-top: 0; color: #111;">${title}</h2>
            <div style="line-height: 1.6; font-size: 14px; white-space: pre-wrap;">${message}</div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #888; margin: 0;">Sent by GoldMailer Administration to all verified members.</p>
          </div>
        `,
        body_text: `${title}\n\n${message}\n\nGoldMailer Administration`,
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_read: false,
        is_starred: true,
        folder: 'primary',
        category: 'updates',
        status: 'inbox'
      });
    }

    this.saveToDiskSync();
    return broadcast;
  }

  // ================= PAYMENTS & INVOICES =================

  public getPayments(): StoredPayment[] {
    return this.payments;
  }

  public async recordPayment(payment: StoredPayment): Promise<StoredPayment> {
    this.payments.unshift(payment);
    this.saveToDiskSync();
    return payment;
  }

  // ================= SECURITY & IP BLOCKLIST =================

  public getBlockedIps(): string[] {
    return Array.from(this.blockedIps);
  }

  public async blockIp(ip: string, reason?: string, adminEmail?: string): Promise<void> {
    this.blockedIps.add(ip);
    this.saveToDiskSync();
    await this.logAdminActivity(
      adminEmail || 'admin@goldmailer.xyz',
      'BLOCK_IP',
      'security',
      ip,
      `Blocked IP: ${ip}. Reason: ${reason || 'Suspicious traffic'}`
    );
  }

  public async unblockIp(ip: string, adminEmail?: string): Promise<void> {
    this.blockedIps.delete(ip);
    this.saveToDiskSync();
    await this.logAdminActivity(
      adminEmail || 'admin@goldmailer.xyz',
      'UNBLOCK_IP',
      'security',
      ip,
      `Unblocked IP: ${ip}`
    );
  }

  public isIpBlocked(ip: string): boolean {
    return this.blockedIps.has(ip);
  }

  // ================= BACKUP & RESTORE =================

  public generateBackupPayload(): string {
    return JSON.stringify(
      {
        version: '2.0.0',
        exported_at: new Date().toISOString(),
        users: this.users,
        emails: this.emails,
        sessions: this.sessions,
        tickets: this.tickets,
        activityLogs: this.activityLogs,
        domains: this.domains,
        adminRoles: this.adminRoles,
        settings: this.settings,
        blockedIps: Array.from(this.blockedIps)
      },
      null,
      2
    );
  }

  public async restoreFromBackupPayload(jsonString: string): Promise<{ success: boolean; usersCount: number; emailsCount: number }> {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed.users)) {
      this.users = parsed.users;
    }
    if (Array.isArray(parsed.emails)) {
      this.emails = parsed.emails;
    }
    if (Array.isArray(parsed.sessions)) {
      this.sessions = parsed.sessions;
    }
    if (Array.isArray(parsed.tickets)) {
      this.tickets = parsed.tickets;
    }
    if (Array.isArray(parsed.activityLogs)) {
      this.activityLogs = parsed.activityLogs;
    }
    if (Array.isArray(parsed.domains)) {
      this.domains = parsed.domains;
    }
    if (parsed.settings) {
      this.settings = { ...this.settings, ...parsed.settings };
    }
    this.saveToDiskSync();
    return {
      success: true,
      usersCount: this.users.length,
      emailsCount: this.emails.length
    };
  }
}

export const db = new GoldDatabase();
