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
}

export interface StoredEmail {
  id: string;
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
    site_url: 'https://goldmailer.com',
    support_email: 'support@goldmailer.com',
    default_domain: 'goldmailer.com',
    allow_registration: true,
    default_storage_bytes: 15 * 1024 * 1024 * 1024,
    pro_price_monthly_usd: 4.99,
    pro_price_yearly_usd: 49.99,
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: parseInt(process.env.SMTP_PORT || '587', 10),
    smtp_user: process.env.SMTP_USER || '',
    smtp_pass: process.env.SMTP_PASS || '',
    smtp_secure: process.env.SMTP_SECURE === 'true',
    twilio_account_sid: process.env.TWILIO_ACCOUNT_SID || '',
    twilio_auth_token: process.env.TWILIO_AUTH_TOKEN || '',
    twilio_trial_number: process.env.TWILIO_PHONE_NUMBER || '+1 (267) 230-1662',
    resend_api_key: process.env.RESEND_API_KEY || '',
    resend_from: process.env.RESEND_FROM || 'GoldMailer Security <security@goldmailer.com>',
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
      const data = {
        users: this.users,
        emails: this.emails,
        sessions: this.sessions,
        tickets: this.tickets,
        activityLogs: this.activityLogs.slice(-500),
        domains: this.domains,
        adminRoles: this.adminRoles,
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
      if (Array.isArray(freshestData.users)) {
        this.users = freshestData.users.map((u: any) => ({
          ...u,
          is_banned: Boolean(u.is_banned),
          banned_at: u.banned_at || (u.is_banned ? new Date().toISOString() : undefined)
        }));
      }
      if (Array.isArray(freshestData.emails)) {
        this.emails = freshestData.emails.map((e: any) => ({
          ...e,
          status: e.status || (e.folder === 'trash' ? 'trash' : 'inbox'),
          folder: e.folder || 'primary'
        }));
      }
      if (Array.isArray(freshestData.sessions)) {
        this.sessions = freshestData.sessions;
      }
      if (Array.isArray(freshestData.tickets)) {
        this.tickets = freshestData.tickets;
      }
      if (Array.isArray(freshestData.activityLogs)) {
        this.activityLogs = freshestData.activityLogs;
      }
      if (Array.isArray(freshestData.domains)) {
        this.domains = freshestData.domains;
      }
      if (Array.isArray(freshestData.adminRoles)) {
        this.adminRoles = freshestData.adminRoles;
      }
      if (Array.isArray(freshestData.broadcasts)) {
        this.broadcasts = freshestData.broadcasts;
      }
      if (Array.isArray(freshestData.payments)) {
        this.payments = freshestData.payments;
      }
      if (Array.isArray(freshestData.blockedIps)) {
        this.blockedIps = new Set(freshestData.blockedIps);
      }
      if (freshestData.settings && typeof freshestData.settings === 'object') {
        this.settings = { ...this.settings, ...freshestData.settings };
      }
      console.log(`✅ Loaded GoldMailer DB from disk: ${this.users.length} accounts, ${this.emails.length} emails`);
    }

    this.isLoaded = true;
  }

  // Seed default admin accounts without overriding their ban status if banned!
  private seedDefaultData() {
    const defaultPasswordHash = bcrypt.hashSync('@654413Mm', 10);

    const defaultAccounts = [
      {
        id: 'usr_miracle_01',
        email: 'miracle@goldmailer.com',
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
        email: 'dorisokoh109@goldmailer.com',
        username: 'dorisokoh109',
        first_name: 'Doris',
        last_name: 'Okoh',
        dob: '1999-07-22',
        gender: 'Female',
        phone: '+1 555 019 2834',
        recovery_phone: '+1 555 019 2834',
        backup_email: 'dorisokoh109@gmail.com',
        role: 'admin' as const,
        plan: 'enterprise' as const
      }
    ];

    let hasChanges = false;
    for (const def of defaultAccounts) {
      const existing = this.users.find(
        u => u.id === def.id ||
             u.username.toLowerCase() === def.username.toLowerCase() ||
             u.email.toLowerCase() === def.email.toLowerCase() ||
             u.email.toLowerCase() === `${def.username}@goldmailer.xyz`
      );

      if (!existing) {
        this.users.push({
          ...def,
          password_hash: defaultPasswordHash,
          two_factor_enabled: false,
          backup_codes: this.generateBackupCodes(),
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          is_banned: false,
          storage_used_bytes: 420 * 1024 * 1024,
          storage_limit_bytes: 15 * 1024 * 1024 * 1024,
          plan_billing: 'yearly',
          plan_status: 'active'
        });
        hasChanges = true;
      } else {
        // IMPORTANT: NEVER reset is_banned if the account was previously banned!
        if (existing.role !== 'admin') {
          existing.role = 'admin';
          hasChanges = true;
        }
      }
    }

    // Default domains
    if (this.domains.length === 0) {
      this.domains = [
        {
          id: 'dom_01',
          domain: 'goldmailer.com',
          is_default: true,
          is_verified: true,
          verification_token: 'v=goldmailer-verify-primary-01',
          mx_record_status: 'valid',
          spf_record_status: 'valid',
          dkim_record_status: 'valid',
          created_at: new Date().toISOString()
        },
        {
          id: 'dom_02',
          domain: 'goldmailer.xyz',
          is_default: false,
          is_verified: true,
          verification_token: 'v=goldmailer-verify-backup-02',
          mx_record_status: 'valid',
          spf_record_status: 'valid',
          dkim_record_status: 'valid',
          created_at: new Date().toISOString()
        }
      ];
      hasChanges = true;
    }

    // Default sample support tickets
    if (this.tickets.length === 0) {
      this.tickets = [
        {
          id: 'tkt_001',
          user_email: 'client.test@goldmailer.com',
          user_name: 'Alex Rivera',
          subject: 'Storage quota upgrade inquiry',
          category: 'billing',
          priority: 'medium',
          status: 'open',
          messages: [
            {
              id: 'msg_01',
              sender_email: 'client.test@goldmailer.com',
              sender_name: 'Alex Rivera',
              is_admin: false,
              content: 'Hello GoldMailer team, I would like to upgrade my storage from 15GB to 100GB. Does NOWPayments accept USDT on TRC20?',
              created_at: new Date(Date.now() - 3600000 * 4).toISOString()
            }
          ],
          created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 4).toISOString()
        }
      ];
      hasChanges = true;
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
        uEmail === `${userPart}@goldmailer.com` ||
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
      adminEmail || 'admin@goldmailer.com',
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
      adminEmail || 'admin@goldmailer.com',
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

  public async insertEmail(email: StoredEmail): Promise<StoredEmail> {
    // Default status to inbox unless sent or draft
    if (!email.status) {
      email.status = email.folder === 'sent' ? 'sent' : email.folder === 'drafts' ? 'draft' : 'inbox';
    }

    console.log(`✅ DB INSERT goldmailer_emails: ID=${email.id}, To=${email.recipient}, Status=${email.status}`);

    const existingIdx = this.emails.findIndex(e => e.id === email.id);
    if (existingIdx !== -1) {
      this.emails[existingIdx] = { ...this.emails[existingIdx], ...email };
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
    return this.emails.find(e => e.id === id) || null;
  }

  public async updateEmailStatus(
    id: string,
    status: 'inbox' | 'trash' | 'deleted' | 'sent' | 'spam',
    folder?: string
  ): Promise<StoredEmail | null> {
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
      console.log(`✅ DB UPDATE email status to inbox (restored): ${id}`);
    } else if (status === 'deleted') {
      console.log(`✅ DB UPDATE email status to permanently deleted: ${id}`);
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

    for (const email of this.emails) {
      if (idSet.has(email.id)) {
        email.status = status;
        if (status === 'trash') {
          email.folder = 'trash';
          email.trashed_at = new Date().toISOString();
        } else if (status === 'inbox') {
          email.folder = 'primary';
          email.trashed_at = undefined;
        } else if (status === 'deleted') {
          email.folder = 'trash';
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
    this.settings = { ...this.settings, ...updates };
    this.saveToDiskSync();
    return this.settings;
  }

  // ================= ADMIN ROLES =================

  public getAdminRoles(): StoredAdminRole[] {
    return this.adminRoles;
  }

  public async addAdminRole(
    email: string,
    name: string,
    role: StoredAdminRole['role'],
    permissions: string[],
    addedBy: string
  ): Promise<StoredAdminRole> {
    const newRole: StoredAdminRole = {
      id: 'role_' + crypto.randomBytes(4).toString('hex'),
      email: email.trim().toLowerCase(),
      name,
      role,
      permissions,
      added_by: addedBy,
      created_at: new Date().toISOString()
    };

    this.adminRoles.push(newRole);
    // Also elevate user in accounts table if exists
    const user = await this.findAccount(email);
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
      adminEmail || 'admin@goldmailer.com',
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
      adminEmail || 'admin@goldmailer.com',
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
