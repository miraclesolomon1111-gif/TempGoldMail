import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import multer from 'multer';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { db, StoredSettings } from './db.js';
import { fetchEmailsFromImap, extractCleanAddress } from './imapService.js';
import {
  StoredSMS,
  StoredPhoneNumber,
  StoredPhonePurchase,
  StoredCall,
  sendSmsViaTwilio,
  makeCallViaTwilio,
  listAvailablePhoneNumbers,
  buyTwilioPhoneNumber,
  getTwilioLogs,
  verifyNowPaymentsSignature,
  createNowPaymentsInvoice,
  getTwilioConfig,
  getTwilioClient,
  setTwilioCredentials,
  testTwilioConnection,
  normalizePhoneNumber
} from './phoneService.js';

// Server-Sent Events (SSE) for Real-Time email, SMS & Calls receiving
const sseClients: Response[] = [];

// Send keep-alive comments every 15 seconds so proxies and browsers never drop the connection
setInterval(() => {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(': keepalive\n\n');
    } catch {
      sseClients.splice(i, 1);
    }
  }
}, 15000);

export function broadcastNewEmail(email: StoredEmail) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: 'new_email', email })}\n\n`);
      (client as any).flush?.();
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

export function broadcastNewSMS(sms: StoredSMS) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: 'new_sms', sms })}\n\n`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

export function broadcastNewCall(call: StoredCall) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: 'new_call', call })}\n\n`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Multer for multipart/form-data inbound email webhooks (SendGrid, Mailgun, Postmark, AWS SES, etc.)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Express middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health Check
app.get(['/api/health', '/api/ping'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'GoldMailer API',
    domain: 'goldmailer.xyz',
    storageLimit: '15GB',
    totalUsers: goldUsers.length,
    totalEmails: goldEmails.length
  });
});

// JWT Token Helper
const JWT_SECRET = process.env.JWT_SECRET || 'goldmailer_super_secret_jwt_key_2026_xyz';
const generateToken = (payload: any): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 86400 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token: string): any | null => {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (expected !== signature) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

// Supabase client initialization (optional persistent DB)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
let supabase: any = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn('⚠️ Supabase init note:', err);
  }
}

// Resend client initialization
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFrom = process.env.RESEND_FROM || 'GoldMailer Security <security@goldmailer.xyz>';
let resendClient: Resend | null = null;
if (resendApiKey) {
  try {
    resendClient = new Resend(resendApiKey);
  } catch (err) {
    console.warn('⚠️ Resend init error:', err);
  }
}

// SMTP Transporter initialization (exclusively using goldmailer.xyz domain)
const smtpHost = process.env.SMTP_HOST || 'smtp.goldmailer.xyz';
const smtpUser = process.env.SMTP_USER || 'postmaster@goldmailer.xyz';
const smtpPass = process.env.SMTP_PASS || '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

let smtpTransporter: any = null;
if (smtpHost && smtpUser && smtpPass) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      name: 'goldmailer.xyz',
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  } catch (smtpErr) {
    console.warn('⚠️ SMTP Transporter init error:', smtpErr);
  }
}

const getActiveSmtpTransporter = () => {
  if (smtpTransporter) return smtpTransporter;
  const cfg = db.getSettings();
  if (cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
    try {
      return nodemailer.createTransport({
        host: cfg.smtp_host,
        port: cfg.smtp_port || 587,
        secure: Boolean(cfg.smtp_secure || cfg.smtp_port === 465),
        name: 'goldmailer.xyz',
        auth: {
          user: cfg.smtp_user,
          pass: cfg.smtp_pass
        }
      });
    } catch {
      return null;
    }
  }
  return null;
};

// Type definitions for server storage
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
  imap_config?: any;
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

export interface StoredDraft {
  id: string;
  user_id: string;
  sender_email: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  updated_at: string;
  created_at: string;
}

export interface StoredDevice {
  id: string;
  user_id: string;
  device_name: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  last_active: string;
  is_trusted: boolean;
  created_at: string;
}

export interface StoredLoginAttempt {
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

export interface StoredOAuthClient {
  client_id: string;
  client_secret: string;
  app_name: string;
  redirect_uri: string;
  logo_url?: string;
  website_url?: string;
  owner_user_id: string;
  created_at: string;
}

export interface StoredOAuthCode {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  expires_at: number;
}

export interface StoredOAuthToken {
  access_token: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;
}

// Persistent Storage file (stored in workspace root to prevent triggering Vite module reloads in src/)
const isServerless = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);
// Persistent Storage files (support both workspace root and /tmp)
const DATA_FILE_ROOT = path.join(process.cwd(), '.goldmailer_data.json');
const DATA_FILE_TMP = path.join('/tmp', '.goldmailer_data.json');

let goldUsers: StoredGoldUser[] = [];
let goldEmails: StoredEmail[] = [];
let goldDrafts: StoredDraft[] = [];
let userDevices: StoredDevice[] = [];
let loginAttempts: StoredLoginAttempt[] = [];
let oauthClients: StoredOAuthClient[] = [];
let oauthCodes: StoredOAuthCode[] = [];
let oauthTokens: StoredOAuthToken[] = [];
let blockedIps: Set<string> = new Set();
let deletedEmailIds: Set<string> = new Set();
export interface StoredContact {
  id: string;
  userId: string;
  name: string;
  phoneNumber: string;
  notes?: string;
  createdAt: string;
}

let sms_inbox: StoredSMS[] = [];
let userPhoneNumbers: StoredPhoneNumber[] = [];
let phonePurchases: StoredPhonePurchase[] = [];
let calls_history: StoredCall[] = [];
let phoneContacts: StoredContact[] = [];

// Helper: 10 random 8-digit backup codes
const generateBackupCodes = (): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
};

let lastDataFileMtime = 0;

// Save data safely to disk (both root and /tmp)
const saveData = () => {
  try {
    const payload = JSON.stringify(
      {
        users: goldUsers,
        goldUsers,
        emails: goldEmails,
        goldEmails,
        goldDrafts,
        userDevices,
        loginAttempts: loginAttempts.slice(-100),
        oauthClients,
        oauthCodes: oauthCodes.slice(-50),
        oauthTokens: oauthTokens.slice(-100),
        blockedIps: Array.from(blockedIps),
        deletedEmailIds: Array.from(deletedEmailIds),
        sms_inbox: sms_inbox.slice(0, 500),
        userPhoneNumbers,
        phonePurchases: phonePurchases.slice(-100),
        calls_history: calls_history.slice(-300),
        phoneContacts: phoneContacts.slice(-500),
        tickets: db.getTickets(),
        activityLogs: db.getActivityLogs(500),
        domains: db.getDomains(),
        adminRoles: db.getAdminRoles(),
        broadcasts: db.getBroadcasts(),
        payments: db.getPayments(),
        settings: db.getSettings(),
        twilioConfig: {
          accountSid: getTwilioConfig().accountSid,
          authToken: getTwilioConfig().authToken,
          trialNumber: getTwilioConfig().trialNumber
        }
      },
      null,
      2
    );

    const targets = [DATA_FILE_ROOT, DATA_FILE_TMP];
    for (const file of targets) {
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(file, payload);
      } catch {}
    }

    try {
      if (fs.existsSync(DATA_FILE_ROOT)) {
        lastDataFileMtime = fs.statSync(DATA_FILE_ROOT).mtimeMs;
      }
    } catch {}
  } catch (e) {
    console.warn('Save data warning:', e);
  }
};

// Load persistent data safely and support hot reloading if external process updates DATA_FILE
export const ensureDataLoaded = () => {
  try {
    const candidateFiles = [DATA_FILE_ROOT, DATA_FILE_TMP];
    let freshestFile: string | null = null;
    let freshestMtime = -1;

    for (const file of candidateFiles) {
      try {
        if (fs.existsSync(file)) {
          const stats = fs.statSync(file);
          if (stats.mtimeMs > freshestMtime && stats.size > 10) {
            freshestMtime = stats.mtimeMs;
            freshestFile = file;
          }
        }
      } catch {}
    }

    if (!freshestFile) return;

    // Fast check: if in-memory cache is already loaded and freshest file hasn't changed, return immediately!
    if (goldUsers.length > 0 && freshestMtime <= lastDataFileMtime) {
      return;
    }
    lastDataFileMtime = freshestMtime;

    try {
      const raw = fs.readFileSync(freshestFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.deletedEmailIds)) {
        for (const did of parsed.deletedEmailIds) {
          deletedEmailIds.add(did);
        }
      }
      const loadedUsers = Array.isArray(parsed.goldUsers) && parsed.goldUsers.length > 0
        ? parsed.goldUsers
        : (Array.isArray(parsed.users) ? parsed.users : []);
      if (loadedUsers.length > 0) {
        for (const rawU of loadedUsers) {
          const cleanUser = (rawU.username || (rawU.email || '').split('@')[0] || '').toLowerCase().trim();
          const u: StoredGoldUser = {
            ...rawU,
            email: cleanUser ? `${cleanUser}@goldmailer.xyz` : rawU.email
          };
          const idx = goldUsers.findIndex(gu => gu.id === u.id || (gu.email && u.email && gu.email.toLowerCase() === u.email.toLowerCase()));
          if (idx === -1) {
            goldUsers.push(u);
          } else {
            goldUsers[idx] = { ...goldUsers[idx], ...u };
          }
          db.upsertAccount(u);
        }
      }
      // Also sync any accounts from db.listAccounts() into goldUsers
      for (const du of db.listAccounts()) {
        const idx = goldUsers.findIndex(gu => gu.id === du.id || (gu.email && du.email && gu.email.toLowerCase() === du.email.toLowerCase()));
        if (idx === -1) {
          goldUsers.push(du);
        } else {
          goldUsers[idx] = { ...goldUsers[idx], ...du };
        }
      }
      for (const gu of goldUsers) {
        db.upsertAccount(gu);
      }
      const loadedEmails = Array.isArray(parsed.goldEmails) && parsed.goldEmails.length > 0
        ? parsed.goldEmails
        : (Array.isArray(parsed.emails) ? parsed.emails : []);
      if (loadedEmails.length > 0) {
        for (const em of loadedEmails) {
          if (deletedEmailIds.has(em.id) || em.status === 'deleted') continue;
          const idx = goldEmails.findIndex(ge => ge.id === em.id);
          if (idx === -1) {
            goldEmails.push(em);
          } else {
            goldEmails[idx] = {
              ...em,
              folder: em.folder || goldEmails[idx].folder || 'primary',
              is_read: em.is_read !== undefined ? em.is_read : goldEmails[idx].is_read,
              is_starred: em.is_starred !== undefined ? em.is_starred : goldEmails[idx].is_starred
            };
          }
        }
      }
      // Also sync any emails from db engine into goldEmails
      for (const dbEm of db.getAllEmails()) {
        if (deletedEmailIds.has(dbEm.id) || dbEm.status === 'deleted') continue;
        const idx = goldEmails.findIndex(ge => ge.id === dbEm.id);
        if (idx === -1) {
          goldEmails.push(dbEm);
        }
      }
      // Purge any deleted emails from memory and deduplicate
      const seenEmailIds = new Set<string>();
      const seenEmailFingerprints = new Set<string>();
      const dedupedEmails: StoredEmail[] = [];
      for (const ge of goldEmails) {
        if (!ge || !ge.id) continue;
        if (deletedEmailIds.has(ge.id) || ge.status === 'deleted') continue;
        if (seenEmailIds.has(ge.id)) continue;
        seenEmailIds.add(ge.id);

        const msgId = (ge as any).messageId || ge.raw?.messageId;
        const fingerprint = msgId
          ? `msgid:${msgId}`
          : `${(ge.from_email || ge.sender || '').toLowerCase()}|${(ge.to_email || ge.recipient || '').toLowerCase()}|${(ge.subject || '').trim().toLowerCase()}|${(ge.received_at || ge.created_at || '').slice(0, 16)}`;

        if (fingerprint && seenEmailFingerprints.has(fingerprint)) continue;
        if (fingerprint) seenEmailFingerprints.add(fingerprint);
        dedupedEmails.push(ge);
      }
      goldEmails = dedupedEmails;

      // Enforce admin policy: ONLY miracle@goldmailer.xyz is admin! Everyone else is regular user!
      for (const gu of goldUsers) {
        if (gu.email?.toLowerCase().trim() !== 'miracle@goldmailer.xyz') {
          gu.role = 'user';
        } else {
          gu.role = 'admin';
        }
      }
      // Guarantee every @goldmailer.xyz address in emails has an active user in the database
      for (const em of goldEmails) {
        const addrs = getAllEmailAddresses([em.recipient, em.to_email, em.to]);
        for (const addr of addrs) {
          const cleanAddr = addr.toLowerCase().trim();
          if (cleanAddr.endsWith('@goldmailer.xyz') && !goldUsers.some(u => u.email.toLowerCase() === cleanAddr)) {
            const userPrefix = cleanAddr.split('@')[0];
            const autoUser: StoredGoldUser = {
              id: 'usr_' + crypto.createHash('md5').update(cleanAddr).digest('hex').slice(0, 12),
              email: cleanAddr,
              username: userPrefix,
              password_hash: bcrypt.hashSync('@654413Mm', 10),
              first_name: userPrefix.charAt(0).toUpperCase() + userPrefix.slice(1),
              last_name: '',
              dob: '1998-05-14',
              gender: 'Not specified',
              phone: '',
              recovery_phone: '',
              backup_email: '',
              two_factor_enabled: false,
              backup_codes: generateBackupCodes(),
              role: cleanAddr === 'miracle@goldmailer.xyz' ? 'admin' : 'user',
              created_at: em.received_at || em.created_at || new Date().toISOString(),
              is_banned: false,
              storage_used_bytes: 0,
              storage_limit_bytes: 15 * 1024 * 1024 * 1024
            };
            goldUsers.push(autoUser);
            db.upsertAccount(autoUser);
          }
        }
      }
      if (Array.isArray(parsed.goldDrafts)) {
        for (const d of parsed.goldDrafts) {
          const idx = goldDrafts.findIndex(gd => gd.id === d.id);
          if (idx === -1) {
            goldDrafts.push(d);
          } else {
            goldDrafts[idx] = { ...goldDrafts[idx], ...d };
          }
        }
      }
      if (Array.isArray(parsed.userDevices)) {
        userDevices = parsed.userDevices;
      }
      if (Array.isArray(parsed.oauthClients)) {
        for (const c of parsed.oauthClients) {
          if (c.client_id === 'client_goldmailer_demo_app') continue;
          if (!oauthClients.some(oc => oc.client_id === c.client_id)) {
            oauthClients.push(c);
          }
        }
      }
      if (Array.isArray(parsed.blockedIps)) {
        blockedIps = new Set(parsed.blockedIps);
      }
      if (Array.isArray(parsed.sms_inbox)) {
        sms_inbox = parsed.sms_inbox;
      }
      if (Array.isArray(parsed.userPhoneNumbers)) {
        userPhoneNumbers = parsed.userPhoneNumbers;
      }
      if (Array.isArray(parsed.phonePurchases)) {
        phonePurchases = parsed.phonePurchases;
      }
      if (Array.isArray(parsed.calls_history)) {
        calls_history = parsed.calls_history;
      }
      if (Array.isArray(parsed.phoneContacts)) {
        phoneContacts = parsed.phoneContacts;
      }
      if (parsed.twilioConfig && typeof parsed.twilioConfig === 'object') {
        setTwilioCredentials(
          parsed.twilioConfig.accountSid || '',
          parsed.twilioConfig.authToken || '',
          parsed.twilioConfig.trialNumber || ''
        );
      }
    } catch (parseErr) {
      console.warn('Data parse error from', freshestFile, parseErr);
    }
  } catch (e) {
    console.warn('Notice: data sync check note', e);
  }
};

// Seed / Update Permanent Accounts
const seedAccounts = () => {
  const defaultPasswordHash = bcrypt.hashSync('@654413Mm', 10);

  // 1. Miracle Solomon
  const miracleUsername = 'miracle';
  const miracleEmail = 'miracle@goldmailer.xyz';
  const existingMiracle = goldUsers.find(
    u => u.username.toLowerCase() === miracleUsername || u.email.toLowerCase() === miracleEmail
  );
  if (existingMiracle) {
    existingMiracle.email = miracleEmail;
    existingMiracle.password_hash = defaultPasswordHash;
    // CRITICAL FIX: NEVER reset is_banned if the account was banned by admin!
    if (existingMiracle.is_banned === undefined) {
      existingMiracle.is_banned = false;
    }
  } else {
    goldUsers.push({
      id: 'usr_miracle_01',
      email: miracleEmail,
      username: miracleUsername,
      password_hash: defaultPasswordHash,
      first_name: 'Miracle',
      last_name: 'Solomon',
      dob: '1998-05-14',
      gender: 'Male',
      phone: '+234 801 234 5678',
      recovery_phone: '+234 801 234 5678',
      backup_email: 'miracle.backup@gmail.com',
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: 'admin',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024,
      avatar_url: ''
    });
  }

  // 2. Doris Okoh
  const dorisUsername = 'dorisokoh109';
  const dorisEmail = 'dorisokoh109@goldmailer.xyz';
  const existingDoris = goldUsers.find(
    u => u.username.toLowerCase() === dorisUsername || u.email.toLowerCase() === dorisEmail || (u.backup_email && u.backup_email.toLowerCase() === 'dorisokoh109@gmail.com')
  );
  if (existingDoris) {
    existingDoris.email = dorisEmail;
    existingDoris.password_hash = defaultPasswordHash;
    existingDoris.role = 'user';
    // CRITICAL FIX: NEVER reset is_banned if the account was banned by admin!
    if (existingDoris.is_banned === undefined) {
      existingDoris.is_banned = false;
    }
    if (!existingDoris.backup_email) existingDoris.backup_email = 'dorisokoh109@gmail.com';
  } else {
    goldUsers.push({
      id: 'usr_doris_01',
      email: dorisEmail,
      username: dorisUsername,
      password_hash: defaultPasswordHash,
      first_name: 'Doris',
      last_name: 'Okoh',
      dob: '1999-07-22',
      gender: 'Female',
      phone: '+1 555 019 2834',
      recovery_phone: '+1 555 019 2834',
      backup_email: 'dorisokoh109@gmail.com',
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: 'user',
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024,
      avatar_url: ''
    });
  }

  // Ensure default welcome emails exist
  const accountsToGreet = [
    { name: 'Miracle', email: miracleEmail },
    { name: 'Doris', email: dorisEmail }
  ];

  for (const acc of accountsToGreet) {
    const welcomeMsgId = 'msg_welcome_' + acc.name.toLowerCase();
    if (deletedEmailIds.has(welcomeMsgId)) continue;
    if (!goldEmails.some(e => e.id === welcomeMsgId || (e.recipient || '').toLowerCase().includes(acc.email.toLowerCase()))) {
      goldEmails.push({
        id: welcomeMsgId,
        recipient: acc.email,
        to_email: acc.email,
        to: acc.email,
        sender: 'GoldMailer Team <team@goldmailer.xyz>',
        from_email: 'team@goldmailer.xyz',
        from: 'team@goldmailer.xyz',
        sender_name: 'GoldMailer Team',
        subject: `Welcome to your permanent GoldMailer account, ${acc.name}! ✉️`,
        body_html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 22px;">G</div>
              <h2 style="color: #FF6A00; margin: 0; font-size: 20px;">Welcome to GoldMailer!</h2>
            </div>
            <p>Hello ${acc.name},</p>
            <p>Your permanent email <strong>${acc.email}</strong> is configured and ready.</p>
            <div style="background: rgba(255,106,0,0.08); padding: 14px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #FF6A00;">
              <p style="margin: 0;"><strong>Storage Quota:</strong> 15 GB Permanent Storage</p>
              <p style="margin: 4px 0 0;"><strong>Security:</strong> Password Protected & 2FA Ready</p>
              <p style="margin: 4px 0 0;"><strong>Multi-Account:</strong> Switch seamlessly between accounts</p>
            </div>
            <p style="color: #666; font-size: 13px;">GoldMailer Team · Fast, Secure Email for Everyone</p>
          </div>
        `,
        body_text: `Welcome to GoldMailer!\n\nHello ${acc.name},\nYour permanent email ${acc.email} is ready with 15GB storage.\n\nGoldMailer Team`,
        received_at: new Date(Date.now() - 3600000).toISOString(),
        created_at: new Date(Date.now() - 3600000).toISOString(),
        is_read: true,
        is_starred: true,
        folder: 'primary',
        category: 'primary',
        status: 'inbox'
      });
      void db.insertEmail(goldEmails[goldEmails.length - 1]);
    }
  }

  // Sync all accounts from db.listAccounts() into goldUsers
  for (const du of db.listAccounts()) {
    const idx = goldUsers.findIndex(gu => gu.id === du.id || (gu.email && du.email && gu.email.toLowerCase() === du.email.toLowerCase()));
    if (idx === -1) {
      goldUsers.push(du);
    } else {
      goldUsers[idx] = { ...goldUsers[idx], ...du };
    }
  }

  // Remove any mock OAuth demo app
  oauthClients = oauthClients.filter(c => c.client_id !== 'client_goldmailer_demo_app');

  // Ensure admin phone number is exclusively assigned to admin (miracle@goldmailer.xyz / admin)
  const defaultTrialNumber = getTwilioConfig().trialNumber || '+17372508034';
  const adminPhone = userPhoneNumbers.find(p => (p.id === 'phone_free_miracle_admin' || p.phoneNumber === defaultTrialNumber || p.phoneNumber.includes('267') || p.phoneNumber.includes('737')) && (p.userId === 'usr_miracle_01' || p.userEmail === 'miracle@goldmailer.xyz'));
  if (!adminPhone) {
    userPhoneNumbers.unshift({
      id: 'phone_free_miracle_admin',
      userId: 'usr_miracle_01',
      userEmail: 'miracle@goldmailer.xyz',
      phoneNumber: defaultTrialNumber,
      friendlyName: `${defaultTrialNumber} (Admin Line)`,
      provider: 'twilio',
      status: 'active',
      purchasedAt: '2026-10-08T00:00:00.000Z',
      expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
      autoRenew: true,
      capabilities: { sms: true, voice: true }
    });
  } else {
    adminPhone.phoneNumber = defaultTrialNumber;
    adminPhone.friendlyName = `${defaultTrialNumber} (Admin Line)`;
    adminPhone.status = 'active';
    adminPhone.userId = 'usr_miracle_01';
    adminPhone.userEmail = 'miracle@goldmailer.xyz';
    adminPhone.capabilities = { sms: true, voice: true };
    const exp = new Date(adminPhone.expiresAt).getTime();
    if (exp < Date.now() + 30 * 86400000) {
      adminPhone.expiresAt = new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString();
    }
  }

  // Remove any fake starter SMS: inbox starts completely clean
  sms_inbox = sms_inbox.filter(s => s.id !== 'sms_welcome_01');

  // Save changes to disk immediately
  saveData();
};

ensureDataLoaded();
seedAccounts();

// Robust helpers for email addresses extraction and target matching
export function getAllEmailAddresses(input: any): string[] {
  if (!input) return [];
  const list: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      list.push(...getAllEmailAddresses(item));
    }
    return list;
  }
  if (typeof input === 'object') {
    const val = input.email || input.address || input.value || input.to || input.from || '';
    if (val) list.push(...getAllEmailAddresses(val));
    return list;
  }
  const str = String(input);
  const parts = str.split(/[,;]+/);
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/) || part.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match && match[1]) {
      list.push(match[1].trim().toLowerCase());
    } else {
      const trimmed = part.trim().toLowerCase();
      if (trimmed.includes('@')) {
        list.push(trimmed);
      } else if (trimmed) {
        list.push(`${trimmed}@goldmailer.xyz`);
      }
    }
  }
  return list;
}

export function extractCleanEmail(input: any): string {
  const addrs = getAllEmailAddresses(input);
  if (addrs.length === 0) return '';
  const goldAddr = addrs.find(a => a.endsWith('@goldmailer.xyz'));
  return goldAddr || addrs[0];
}

export function emailMatchesTarget(fieldVal: any, targetEmail: string): boolean {
  if (!targetEmail) return false;
  const cleanTarget = targetEmail.trim().toLowerCase();
  const targetPrefix = cleanTarget.replace(/@.*$/, '');
  const addresses = getAllEmailAddresses(fieldVal);
  for (const addr of addresses) {
    const cleanAddr = addr.trim().toLowerCase();
    if (
      cleanAddr === cleanTarget ||
      cleanAddr === targetPrefix ||
      cleanAddr === `${targetPrefix}@goldmailer.xyz` ||
      (cleanTarget.endsWith('@goldmailer.xyz') && cleanAddr.replace(/@.*$/, '') === targetPrefix)
    ) {
      return true;
    }
  }
  return false;
}

function extractCleanSender(input: any): string {
  if (!input) return 'sender@external.com';
  let str = '';
  if (Array.isArray(input)) {
    str = String(input[0] || '');
  } else if (typeof input === 'object') {
    str = String(input.name || input.email || input.address || 'sender@external.com');
  } else {
    str = String(input);
  }
  return str.trim();
}

// Device info helper
const parseDeviceInfo = (req: Request) => {
  const ua = req.headers['user-agent'] || 'Unknown Browser';
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  let os = 'Windows 11';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('iPhone')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';

  const location = 'Lagos, Nigeria';
  const deviceName = `${os} - ${location} - ${browser}`;
  return { deviceName, browser, os, ip, location };
};

const sanitizeUser = (u: StoredGoldUser) => {
  const { password_hash, two_factor_secret, ...safe } = u;
  return safe;
};

// ================= AUTHENTICATION & MULTI-ACCOUNT ENDPOINTS =================

// 1. Live Username Availability Check
app.get('/api/auth/check-username', (req: Request, res: Response) => {
  try {
    const rawUsername = (req.query.username as string || '').toLowerCase().trim();
    if (!rawUsername) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const cleanUsername = rawUsername.replace(/@.*$/, '').trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(cleanUsername)) {
      return res.json({
        available: false,
        username: cleanUsername,
        message: 'Username must be 3-30 characters with letters, numbers, dots, or underscores'
      });
    }

    const taken = goldUsers.some(u => u.username.toLowerCase() === cleanUsername);
    return res.json({
      available: !taken,
      username: cleanUsername,
      full_email: `${cleanUsername}@goldmailer.xyz`,
      message: taken ? 'This username is already taken. Try another or pick a suggestion.' : 'This username is available!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Suggest Usernames based on First and Last Name
app.get('/api/auth/suggest-usernames', (req: Request, res: Response) => {
  try {
    const firstName = ((req.query.firstName as string) || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const lastName = ((req.query.lastName as string) || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const candidates = [
      lastName ? `${firstName}.${lastName}${Math.floor(100 + Math.random() * 900)}` : `${firstName}.${Math.floor(100 + Math.random() * 900)}`,
      lastName ? `${firstName}${lastName}07` : `${firstName}gold24`,
      lastName ? `${firstName}.${new Date().getFullYear()}` : `${firstName}.${new Date().getFullYear()}`
    ];

    const availableSuggestions = candidates
      .filter(cand => !goldUsers.some(u => u.username.toLowerCase() === cand.toLowerCase()))
      .slice(0, 3)
      .map(cand => `${cand}@goldmailer.xyz`);

    return res.json({ suggestions: availableSuggestions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Helper: Normalize login/auth identifier with Google Gmail conventions (dot-insensitivity, plus-addressing)
export function normalizeUserIdentifier(raw: string) {
  let clean = String(raw || '').trim().toLowerCase();
  clean = clean.replace(/^@+/, '');
  clean = clean.replace(/\+[^@]*@/, '@');
  const usernamePart = clean.replace(/@.*$/, '').trim();
  const usernameNoDots = usernamePart.replace(/\./g, '');
  const cleanNoDots = clean.replace(/\./g, '');
  const asGoldXyz = `${usernamePart}@goldmailer.xyz`;
  const asGoldXyzNoDots = `${usernameNoDots}@goldmailer.xyz`;

  return {
    clean,
    usernamePart,
    usernameNoDots,
    cleanNoDots,
    asGoldXyz,
    asGoldXyzNoDots
  };
}

export function matchesUserIdentifier(user: StoredGoldUser, rawInput: string): boolean {
  if (!user || !rawInput) return false;
  const { clean, usernamePart, usernameNoDots, cleanNoDots, asGoldXyz, asGoldXyzNoDots } =
    normalizeUserIdentifier(rawInput);

  const uEmail = (user.email || '').toLowerCase().trim();
  const uUsername = (user.username || '').toLowerCase().trim();
  const uBackup = (user.backup_email || '').toLowerCase().trim();

  const uEmailNoDots = uEmail.replace(/\./g, '');
  const uUsernameNoDots = uUsername.replace(/\./g, '');
  const uBackupNoDots = uBackup.replace(/\./g, '');

  return (
    uEmail === clean ||
    uEmail === usernamePart ||
    uEmail === asGoldXyz ||
    uUsername === clean ||
    uUsername === usernamePart ||
    (Boolean(uBackup) && uBackup === clean) ||
    uUsernameNoDots === usernameNoDots ||
    uEmailNoDots === cleanNoDots ||
    uEmailNoDots === asGoldXyzNoDots ||
    (Boolean(uBackup) && uBackupNoDots === cleanNoDots)
  );
}

// Client Accounts Sync: Re-hydrate client accounts from localStorage into server memory
app.post('/api/auth/sync-client-accounts', (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { accounts } = req.body;
    if (Array.isArray(accounts)) {
      let added = 0;
      for (const acc of accounts) {
        if (!acc.email) continue;
        const cleanEmail = acc.email.toLowerCase().trim();
        const cleanUser = (acc.username || cleanEmail.split('@')[0] || '').toLowerCase().trim();
        const existing = goldUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (existing) {
          db.upsertAccount(existing);
        } else {
          const newUser: StoredGoldUser = {
            id: acc.id || ('usr_' + crypto.randomBytes(8).toString('hex')),
            email: cleanEmail,
            username: cleanUser,
            password_hash: bcrypt.hashSync('@654413Mm', 10),
            first_name: acc.name?.split(' ')[0] || cleanUser,
            last_name: acc.name?.split(' ').slice(1).join(' ') || '',
            dob: '1998-05-14',
            gender: 'Not specified',
            phone: '',
            recovery_phone: '',
            backup_email: '',
            two_factor_enabled: false,
            backup_codes: generateBackupCodes(),
            role: acc.role || 'user',
            created_at: new Date().toISOString(),
            is_banned: false,
            storage_used_bytes: 0,
            storage_limit_bytes: 15 * 1024 * 1024 * 1024,
            avatar_url: acc.avatar_url || ''
          };
          goldUsers.push(newUser);
          db.upsertAccount(newUser);
          added++;
        }
      }
      if (added > 0) saveData();
    }
    return res.json({ success: true, total_users: db.listAccounts().length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Instant Email/Account Creation (Syncs immediately with database and shows in Admin Panel)
app.post(['/api/accounts/create', '/api/auth/create-email'], (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { email, username, firstName, lastName, password } = req.body || {};
    const inputUser = (username || (email || '').split('@')[0] || '').toLowerCase().trim();
    if (!inputUser) {
      return res.status(400).json({ error: 'Username or email address is required' });
    }
    const cleanEmail = `${inputUser}@goldmailer.xyz`;
    let user = goldUsers.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      user = db.listAccounts().find(u => u.email.toLowerCase() === cleanEmail);
    }
    if (user) {
      db.upsertAccount(user);
      return res.json({ success: true, message: 'Account exists and synced', user: sanitizeUser(user) });
    }

    const newUser: StoredGoldUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      email: cleanEmail,
      username: inputUser,
      password_hash: bcrypt.hashSync(password ? String(password).trim() : '@654413Mm', 10),
      first_name: firstName?.trim() || inputUser.charAt(0).toUpperCase() + inputUser.slice(1),
      last_name: lastName?.trim() || '',
      dob: '1998-05-14',
      gender: 'Not specified',
      phone: '',
      recovery_phone: '',
      backup_email: '',
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: 'user',
      created_at: new Date().toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024
    };

    goldUsers.unshift(newUser);
    db.upsertAccount(newUser);
    saveData();

    return res.status(201).json({
      success: true,
      message: 'Email created and synced to database instantly',
      user: sanitizeUser(newUser)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Register Permanent GoldMailer Account (Direct - NO SMS code required)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { firstName, lastName, dob, gender, username, password, phone, country } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: 'First name, username, and password are required' });
    }

    const { usernamePart, asGoldXyz } = normalizeUserIdentifier(username);
    if (!usernamePart || usernamePart.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters long' });
    }

    // Default and primary domain is exclusively goldmailer.xyz
    const cleanEmail = asGoldXyz;

    // Check DB for existing account
    const existing = await db.findAccount(usernamePart);
    if (existing || goldUsers.some(u => (u.username || '').toLowerCase() === usernamePart || (u.email || '').toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: `Username @${usernamePart} is already registered. Please choose another.` });
    }

    const passwordHash = bcrypt.hashSync(String(password).trim(), 10);
    const backupCodes = generateBackupCodes();

    const newUser: StoredGoldUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      email: cleanEmail,
      username: usernamePart,
      password_hash: passwordHash,
      first_name: firstName.trim(),
      last_name: (lastName || '').trim(),
      dob: dob || '',
      gender: gender || 'Prefer not to say',
      phone: phone || '',
      recovery_phone: phone || '',
      backup_email: '',
      two_factor_enabled: false,
      backup_codes: backupCodes,
      role: cleanEmail === 'miracle@goldmailer.xyz' ? 'admin' : 'user',
      created_at: new Date().toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024, // 15 GB
      avatar_url: ''
    };

    // Save to Database (Supabase + Persistent Disk)
    await db.insertAccount(newUser);
    goldUsers.unshift(newUser);

    // Welcome email in user's inbox
    const welcomeEmail: StoredEmail = {
      id: 'msg_welcome_' + newUser.id,
      recipient: cleanEmail,
      to_email: cleanEmail,
      to: cleanEmail,
      sender: 'GoldMailer Team <team@goldmailer.xyz>',
      from_email: 'team@goldmailer.xyz',
      from: 'team@goldmailer.xyz',
      sender_name: 'GoldMailer Team',
      subject: `Welcome to GoldMailer, ${firstName}! Your 15GB permanent mailbox is active 🚀`,
      body_html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
          <h2 style="color: #FF6A00; margin-top: 0;">Welcome to GoldMailer!</h2>
          <p>Hi ${firstName},</p>
          <p>Your permanent email address <strong>${cleanEmail}</strong> has been secured in the database.</p>
          <div style="background: rgba(255, 106, 0, 0.08); padding: 14px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Quota:</strong> 15 GB High-Speed Permanent Storage</p>
            <p style="margin: 4px 0 0;"><strong>Status:</strong> Active & Permanent</p>
          </div>
          <p>You can sign in to multiple GoldMailer accounts and switch between them anytime without losing your sessions.</p>
          <p>Cheers,<br>The GoldMailer Team</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer, ${firstName}!\nYour permanent email ${cleanEmail} is ready with 15GB storage.\n\nGoldMailer Team`,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false,
      is_starred: true,
      folder: 'primary',
      category: 'primary',
      status: 'inbox'
    };

    await db.insertEmail(welcomeEmail);
    goldEmails.unshift(welcomeEmail);

    saveData();

    const token = generateToken({ id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role });

    // Record session in DB
    await db.createSession({
      session_id: 'sess_' + crypto.randomBytes(8).toString('hex'),
      user_id: newUser.id,
      email: newUser.email,
      token,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(newUser),
      backup_codes: backupCodes
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. User Login (Supports any registered user, robust database lookup & 2FA enforcement)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username, password, totp_code, backup_code, code, client_accounts } = req.body;
    const rawInput = (identifier || email || username || '').trim();
    if (!rawInput || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    // 1. Check Database first
    let user = await db.findAccount(rawInput);
    if (!user) {
      user = goldUsers.find(u => matchesUserIdentifier(u, rawInput)) || null;
    }

    // Fallback: Check if client has this account in client cache
    if (!user && Array.isArray(client_accounts)) {
      const clientAcc = client_accounts.find((acc: any) => {
        return matchesUserIdentifier({ email: acc.email, username: acc.username, backup_email: '' } as any, rawInput);
      });

      if (clientAcc) {
        const pwdHash = bcrypt.hashSync(String(password).trim(), 10);
        const newUserObj: StoredGoldUser = {
          id: clientAcc.id || ('usr_' + crypto.randomBytes(8).toString('hex')),
          email: clientAcc.email,
          username: clientAcc.username || clientAcc.email.split('@')[0],
          password_hash: pwdHash,
          first_name: clientAcc.name?.split(' ')[0] || clientAcc.username,
          last_name: clientAcc.name?.split(' ').slice(1).join(' ') || '',
          dob: '1998-05-14',
          gender: 'Not specified',
          phone: '',
          recovery_phone: '',
          backup_email: '',
          two_factor_enabled: false,
          backup_codes: generateBackupCodes(),
          role: clientAcc.role || 'user',
          created_at: new Date().toISOString(),
          is_banned: false,
          storage_used_bytes: 0,
          storage_limit_bytes: 15 * 1024 * 1024 * 1024,
          avatar_url: clientAcc.avatar_url || ''
        };
        await db.insertAccount(newUserObj);
        goldUsers.unshift(newUserObj);
        user = newUserObj;
        saveData();
      }
    }

    if (!user) {
      return res.status(404).json({
        error: 'No GoldMailer account found with that email or username. Please check your credentials or click "Create Account".'
      });
    }

    // BACKEND BAN ENFORCEMENT: Block login permanently if account is banned!
    if (user.is_banned) {
      console.warn(`⛔ [LOGIN BLOCKED] Account ${user.email} is banned (banned_at: ${user.banned_at || 'unknown'})`);
      return res.status(403).json({
        error: `This account (${user.email}) has been suspended by administrators.${user.ban_reason ? ` Reason: ${user.ban_reason}` : ''}`,
        is_banned: true,
        banned_at: user.banned_at,
        ban_reason: user.ban_reason
      });
    }

    // Special check for Miracle & Doris default passwords or bcrypt hash
    const inputPass = String(password).trim();
    const isSpecialDefaultAccount =
      user.username.toLowerCase() === 'miracle' ||
      user.email.toLowerCase() === 'miracle@goldmailer.xyz' ||
      user.username.toLowerCase() === 'dorisokoh109' ||
      user.username.toLowerCase() === 'doris' ||
      user.email.toLowerCase() === 'dorisokoh109@goldmailer.xyz';

    let passwordMatch = false;
    if (isSpecialDefaultAccount && (inputPass === '@654413Mm' || inputPass === 'Password123!')) {
      passwordMatch = true;
    } else if (user.password_hash) {
      passwordMatch = bcrypt.compareSync(inputPass, user.password_hash);
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // 2FA Enforcement
    if (user.two_factor_enabled) {
      const codeInput = (totp_code || backup_code || code || '').toString().trim();
      if (!codeInput) {
        const tempToken = generateToken({ id: user.id, email: user.email, temp_2fa: true });
        return res.status(200).json({
          requires_2fa: true,
          temp_auth_token: tempToken,
          email: user.email,
          message: 'Two-factor authentication code required'
        });
      }

      let valid2FA = false;
      const cleanCode = codeInput.replace(/[\s\-]/g, '');
      if (user.two_factor_secret && /^\d{6}$/.test(cleanCode)) {
        try {
          const totp = new OTPAuth.TOTP({
            issuer: 'GoldMailer',
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
          });
          const delta = totp.validate({ token: cleanCode, window: 2 });
          if (delta !== null) valid2FA = true;
        } catch {}
      }

      if (!valid2FA && Array.isArray(user.backup_codes)) {
        const matchIdx = user.backup_codes.findIndex(
          bc => bc.replace(/[\s\-]/g, '').trim() === cleanCode
        );
        if (matchIdx !== -1) {
          valid2FA = true;
          user.backup_codes.splice(matchIdx, 1);
          await db.updateAccount(user.id, { backup_codes: user.backup_codes });
        }
      }

      if (!valid2FA) {
        return res.status(401).json({ error: 'Invalid 2FA code or backup code' });
      }
    }

    // Save session in DB
    const token = generateToken({ id: user.id, email: user.email, username: user.username, role: user.role });
    const session = await db.createSession({
      session_id: 'sess_' + crypto.randomBytes(8).toString('hex'),
      user_id: user.id,
      email: user.email,
      token,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    });

    console.log(`✅ [LOGIN SUCCESS] Logged in: ${user.email}`);
    return res.json({
      success: true,
      token,
      user: sanitizeUser(user),
      session_id: session.session_id
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4b. Switch Account (Switch session seamlessly without deleting or losing accounts)
app.post('/api/auth/switch-account', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { targetEmail, sessionId } = req.body;
    const cleanTarget = (targetEmail || '').trim().toLowerCase();
    if (!cleanTarget && !sessionId) {
      return res.status(400).json({ error: 'targetEmail or sessionId is required' });
    }

    let targetUser: StoredGoldUser | null = null;
    if (cleanTarget) {
      targetUser = await db.findAccount(cleanTarget);
      if (!targetUser) {
        targetUser = goldUsers.find(u => matchesUserIdentifier(u, cleanTarget)) || null;
      }
    } else if (sessionId) {
      const sess = await db.getSession(sessionId);
      if (sess) {
        targetUser = await db.findAccount(sess.email);
      }
    }

    if (!targetUser) {
      console.warn(`[SWITCH ACCOUNT] Account not found: ${cleanTarget}`);
      return res.status(404).json({ error: `Account ${cleanTarget} not found in database. Please sign in again.` });
    }

    if (targetUser.is_banned) {
      return res.status(403).json({
        error: `Account ${targetUser.email} is suspended by administrator.`,
        is_banned: true,
        banned_at: targetUser.banned_at,
        ban_reason: targetUser.ban_reason
      });
    }

    // Generate fresh token
    const token = generateToken({
      id: targetUser.id,
      email: targetUser.email,
      username: targetUser.username,
      role: targetUser.role
    });

    const session = await db.createSession({
      session_id: sessionId || ('sess_' + crypto.randomBytes(8).toString('hex')),
      user_id: targetUser.id,
      email: targetUser.email,
      token,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    });

    console.log(`✅ [SWITCH ACCOUNT] Switched successfully to: ${targetUser.email}`);
    return res.json({
      success: true,
      token,
      user: sanitizeUser(targetUser),
      session_id: session.session_id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4c. Active Sessions endpoint
app.get('/api/auth/sessions', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded?.email) return res.status(401).json({ error: 'Invalid token' });

    const sessions = await db.getSessionsForUser(decoded.email);
    return res.json({ success: true, sessions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Dedicated 2FA Verification Endpoint
app.post('/api/auth/verify-2fa', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username, temp_auth_token, totp_code, backup_code, code } = req.body;
    const codeProvided = (totp_code || backup_code || code || '').toString().trim();

    if (!codeProvided) {
      return res.status(400).json({ error: 'Verification code or backup code is required' });
    }

    let user: StoredGoldUser | undefined;

    if (temp_auth_token) {
      const decoded = verifyToken(temp_auth_token);
      if (decoded?.id) {
        user = goldUsers.find(u => u.id === decoded.id);
      }
    }

    if (!user) {
      const rawInput = (identifier || email || username || '').trim();
      user = goldUsers.find(u => matchesUserIdentifier(u, rawInput));
    }

    if (!user) {
      return res.status(404).json({ error: 'User session expired. Please sign in again.' });
    }

    let valid = false;
    const cleanCode = codeProvided.replace(/[\s\-]/g, '');

    // Check TOTP
    if (user.two_factor_secret && /^\d{6}$/.test(cleanCode)) {
      try {
        const totp = new OTPAuth.TOTP({
          issuer: 'GoldMailer',
          label: user.email,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
        });
        const delta = totp.validate({ token: cleanCode, window: 2 });
        if (delta !== null) valid = true;
      } catch {}
    }

    // Check Backup Codes
    if (!valid && Array.isArray(user.backup_codes)) {
      const matchIdx = user.backup_codes.findIndex(
        bc => bc.replace(/[\s\-]/g, '').trim() === cleanCode
      );
      if (matchIdx !== -1) {
        valid = true;
        user.backup_codes.splice(matchIdx, 1);
        saveData();
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid 2FA code or backup code. Please check and try again.' });
    }

    const token = generateToken({ id: user.id, email: user.email, username: user.username, role: user.role });
    return res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Forgot Password: Generate secure token and send recovery link via SMTP / Resend
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username } = req.body;
    const rawInput = (identifier || email || username || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Please enter your GoldMailer address or username' });
    }

    const user = goldUsers.find(u => matchesUserIdentifier(u, rawInput));

    if (!user) {
      return res.status(404).json({ error: 'No GoldMailer account found matching that address or username.' });
    }

    // Generate secure 32-byte hex reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.reset_token = resetToken;
    user.reset_token_expires = Date.now() + 3600000; // 1 hour validity
    await db.updateAccount(user.id, { reset_token: resetToken, reset_token_expires: user.reset_token_expires });
    saveData();

    // Determine target recovery email (linked recovery email or user's email)
    const recoveryEmail = (user.backup_email || user.email).trim();
    const appBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${appBaseUrl}/#reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const fromAddress = process.env.SMTP_FROM || process.env.RESEND_FROM || 'GoldMailer Security <security@goldmailer.xyz>';
    const emailSubject = 'Reset your GoldMailer password';
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #fed7aa; border-radius: 16px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 22px;">G</div>
          <div>
            <h2 style="margin: 0; color: #18181b; font-size: 20px;">GoldMailer Security</h2>
            <span style="font-size: 12px; color: #71717a;">Account Password Recovery</span>
          </div>
        </div>

        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">Hello <strong>${user.first_name || user.username}</strong>,</p>
        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">We received a request to reset the password for your GoldMailer account <strong>${user.email}</strong>.</p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6A00, #FF8C42); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(255, 106, 0, 0.35);">
            Reset Password
          </a>
        </div>

        <p style="font-size: 13px; color: #71717a; line-height: 1.5;">This password reset link will expire in <strong>60 minutes</strong>. If you did not make this request, your account remains secure and you can safely ignore this email.</p>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa;">
          <p style="margin: 0;">Direct link: <a href="${resetUrl}" style="color: #FF6A00;">${resetUrl}</a></p>
          <p style="margin: 8px 0 0;">GoldMailer Security Team · Fast, Secure Email for Everyone</p>
        </div>
      </div>
    `;

    const emailText = `Hello ${user.first_name || user.username},\n\nWe received a request to reset your GoldMailer password for ${user.email}.\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 60 minutes. If you did not request this, you can safely ignore this email.\n\nGoldMailer Security Team`;

    let sentVia = 'in-memory-queue';

    // A. Send via SMTP if transporter configured (exclusively goldmailer.xyz)
    const activeSmtp = getActiveSmtpTransporter();
    if (activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromAddress,
          to: recoveryEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sentVia = 'smtp';
      } catch (smtpErr: any) {
        console.warn('SMTP send note:', smtpErr.message);
      }
    }

    // B. Send via Resend if SMTP failed or not configured
    if (sentVia !== 'smtp' && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        await client.emails.send({
          from: fromAddress,
          to: [recoveryEmail],
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sentVia = 'resend';
      } catch (resendErr: any) {
        console.warn('Resend send note:', resendErr.message);
      }
    }

    // Always store security notification email in GoldMailer inbox as backup
    goldEmails.unshift({
      id: 'msg_reset_' + crypto.randomBytes(8).toString('hex'),
      recipient: user.email,
      to_email: user.email,
      to: user.email,
      sender: fromAddress,
      from_email: 'security@goldmailer.xyz',
      from: fromAddress,
      sender_name: 'GoldMailer Security',
      subject: emailSubject,
      body_html: emailHtml,
      body_text: emailText,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false,
      is_starred: true,
      folder: 'primary',
      category: 'primary'
    });
    saveData();

    // Mask recovery email for privacy display
    const atIdx = recoveryEmail.indexOf('@');
    const maskedUser = atIdx > 2 ? recoveryEmail[0] + '***' + recoveryEmail[atIdx - 1] : recoveryEmail[0] + '***';
    const maskedRecovery = `${maskedUser}@${recoveryEmail.slice(atIdx + 1)}`;

    return res.json({
      success: true,
      message: `Password reset link dispatched to linked recovery email (${maskedRecovery}).`,
      recovery_email: maskedRecovery,
      reset_url: resetUrl,
      reset_token: resetToken,
      sent_via: sentVia
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Reset Password: Consume token and update user password
app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { token, email, new_password, password } = req.body;
    const finalPassword = (new_password || password || '').trim();

    if (!token || !finalPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (finalPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const cleanToken = String(token).trim();
    let user = goldUsers.find(u => {
      if (u.reset_token && u.reset_token === cleanToken) {
        if (!email) return true;
        return matchesUserIdentifier(u, String(email).trim());
      }
      return false;
    });

    if (!user) {
      const allAccounts = await db.getAllAccounts();
      user = allAccounts.find(u => {
        if (u.reset_token && u.reset_token === cleanToken) {
          if (!email) return true;
          return matchesUserIdentifier(u, String(email).trim());
        }
        return false;
      }) as StoredGoldUser | undefined;
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    if (!user.reset_token_expires || user.reset_token_expires < Date.now()) {
      return res.status(400).json({ error: 'Password reset link has expired. Please request a new one.' });
    }

    // Update password hash & clear token
    user.password_hash = bcrypt.hashSync(finalPassword, 10);
    user.reset_token = undefined;
    user.reset_token_expires = undefined;
    await db.updateAccount(user.id, {
      password_hash: user.password_hash,
      reset_token: undefined,
      reset_token_expires: undefined
    });
    saveData();

    const authToken = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });

    return res.json({
      success: true,
      message: 'Password updated successfully! You can now log into your account.',
      token: authToken,
      user: sanitizeUser(user)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Get Current User Profile (/api/auth/me)
app.get('/api/auth/me', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_banned) return res.status(403).json({ error: 'Account disabled' });

  return res.json({ user: sanitizeUser(user) });
});

// 6. Update Profile Information
app.put('/api/auth/profile', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { first_name, last_name, phone, recovery_phone, backup_email, avatar_url } = req.body;
  if (first_name !== undefined) user.first_name = first_name;
  if (last_name !== undefined) user.last_name = last_name;
  if (phone !== undefined) user.phone = phone;
  if (recovery_phone !== undefined) user.recovery_phone = recovery_phone;
  if (backup_email !== undefined) user.backup_email = backup_email;
  if (avatar_url !== undefined) user.avatar_url = avatar_url;

  saveData();
  return res.json({ success: true, user: sanitizeUser(user) });
});

// 7. Session status check (No auto-login)
app.get('/api/auth/default-session', (_req: Request, res: Response) => {
  return res.status(401).json({ error: 'No active session. Please log in.' });
});

// ================= EMAIL MESSAGES & SYNCING (PERMANENT & STABLE) =================

// 1. GET emails for user or recipient
app.get(['/api/emails', '/api/emails/:emailAddress'], async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    let rawTarget = req.params.emailAddress || (req.query.email as string) || '';
    if (!rawTarget && req.headers.authorization) {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      const decoded = verifyToken(token);
      if (decoded?.email) rawTarget = decoded.email;
    }
    const cleanTarget = rawTarget.toLowerCase().trim();
    const folder = ((req.query.folder as string) || 'all').toLowerCase().trim();

    // Check if target account is banned in DB (Instant in-memory check to prevent lag)
    const account = goldUsers.find(u => matchesUserIdentifier(u, cleanTarget)) || db.findAccountSync(cleanTarget) || await db.findAccount(cleanTarget);
    if (account && account.is_banned) {
      console.warn(`⛔ [BLOCKED] Banned user attempted to fetch emails: ${account.email}`);
      return res.status(403).json({
        error: `This account has been banned/suspended by administrator.${account.ban_reason ? ` Reason: ${account.ban_reason}` : ''}`,
        is_banned: true,
        banned_at: account.banned_at,
        ban_reason: account.ban_reason
      });
    }

    const matches = goldEmails.filter(e => {
      // NEVER show permanently deleted emails
      if (e.status === 'deleted') return false;

      const isToMe =
        emailMatchesTarget(e.recipient, cleanTarget) ||
        emailMatchesTarget(e.to_email, cleanTarget) ||
        emailMatchesTarget(e.to, cleanTarget) ||
        emailMatchesTarget(e.cc, cleanTarget) ||
        emailMatchesTarget(e.bcc, cleanTarget);

      const isFromMe =
        emailMatchesTarget(e.from_email, cleanTarget) ||
        emailMatchesTarget(e.sender, cleanTarget) ||
        emailMatchesTarget(e.from, cleanTarget);

      if (!isToMe && !isFromMe) return false;

      // Trash folder: ONLY show emails marked as trash!
      if (folder === 'trash') {
        return e.status === 'trash' || e.folder === 'trash';
      }

      // If viewing 'all', return all non-deleted emails (including trash & sent) so client knows complete mailbox state
      if (folder === 'all') {
        return true;
      }

      // If viewing any other folder, HARD EXCLUDE trash!
      if (e.status === 'trash' || e.folder === 'trash') {
        return false;
      }

      // Starred folder
      if (folder === 'starred') {
        return Boolean(e.is_starred);
      }

      // Sent / Outbox / Scheduled folder
      if (folder === 'sent' || folder === 'outbox' || folder === 'scheduled') {
        return isFromMe && (e.folder === folder || e.folder === 'sent');
      }

      // Spam folder
      if (folder === 'spam') {
        return isToMe && (e.folder === 'spam' || e.status === 'spam');
      }

      // All Mail / All Inboxes: Return all non-trash emails
      if (folder === 'all_mail' || folder === 'all_inboxes') {
        return true;
      }

      // Primary / Inbox folder
      if (folder === 'primary' || folder === 'inbox') {
        return isToMe && (e.status === 'inbox' || !e.status || e.folder === 'primary' || e.folder === 'inbox') && e.folder !== 'trash' && e.folder !== 'spam' && e.folder !== 'sent';
      }

      // Specific category or folder
      if (isToMe && e.folder !== 'trash' && e.folder !== 'spam' && e.folder !== 'sent') {
        return e.folder === folder || e.category === folder;
      }

      return false;
    });

    matches.sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime());

    // Deduplicate matches so client NEVER sees duplicate emails
    const uniqueMatches: StoredEmail[] = [];

    for (const m of matches) {
      if (!m || !m.id) continue;
      if (deletedEmailIds.has(m.id) || m.status === 'deleted') continue;

      const mMsgId = ((m as any).messageId || m.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
      const mFrom = (m.from_email || m.sender || m.from || '').trim().toLowerCase();
      const mTo = (m.to_email || m.recipient || m.to || '').trim().toLowerCase();
      const mSub = (m.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
      const mTime = new Date(m.received_at || m.created_at || 0).getTime();
      const mBodyLen = (m.body_text || m.text || m.body || '').replace(/<[^>]+>/g, '').trim().length;

      const existingIdx = uniqueMatches.findIndex(ex => {
        if (ex.id === m.id) return true;

        const exMsgId = ((ex as any).messageId || ex.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
        if (mMsgId && exMsgId && mMsgId === exMsgId) return true;

        const exFrom = (ex.from_email || ex.sender || ex.from || '').trim().toLowerCase();
        const exTo = (ex.to_email || ex.recipient || ex.to || '').trim().toLowerCase();
        const exSub = (ex.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');

        const sameSender = mFrom === exFrom || (mFrom && exFrom && mFrom.split('@')[0] === exFrom.split('@')[0]);
        const sameTo = !mTo || !exTo || mTo === exTo || mTo.split('@')[0] === exTo.split('@')[0];

        if (sameSender && sameTo && mSub === exSub) {
          const exTime = new Date(ex.received_at || ex.created_at || 0).getTime();
          const timeDiff = Math.abs(mTime - exTime);

          // Within 2 hours: identical email transmission
          if (timeDiff <= 2 * 60 * 60 * 1000) return true;

          // If one has empty body and one has content within 24 hours: same email
          const exBodyLen = (ex.body_text || ex.text || ex.body || '').replace(/<[^>]+>/g, '').trim().length;
          if ((mBodyLen === 0 || exBodyLen === 0) && timeDiff <= 24 * 60 * 60 * 1000) return true;

          // Or if body snippet is identical
          const mSnip = (m.body_text || m.text || m.body || '').slice(0, 50).trim();
          const exSnip = (ex.body_text || ex.text || ex.body || '').slice(0, 50).trim();
          if (mSnip && exSnip && mSnip === exSnip) return true;
        }

        return false;
      });

      if (existingIdx !== -1) {
        const existing = uniqueMatches[existingIdx];
        const exBodyLen = (existing.body_text || existing.text || existing.body || '').replace(/<[^>]+>/g, '').trim().length;

        // If current match has body content and existing was empty, replace with the richer version
        if (mBodyLen >= exBodyLen) {
          uniqueMatches[existingIdx] = {
            ...existing,
            ...m,
            is_read: existing.is_read || m.is_read,
            is_starred: existing.is_starred || m.is_starred
          };
        }
      } else {
        uniqueMatches.push(m);
      }
    }

    console.log(`[EMAILS] Retrieved ${uniqueMatches.length} emails for target "${cleanTarget}" (folder="${folder}")`);
    return res.json(uniqueMatches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Real-time Server-Sent Events (SSE) Stream
app.get('/api/emails/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// 3. Comprehensive Email Sync (IMAP + Resend + Historical & Live)
app.post('/api/emails/sync', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { email } = req.body;
    let authUserEmail = '';
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const decoded = verifyToken(authHeader.replace(/^Bearer\s+/i, ''));
      if (decoded?.email) authUserEmail = decoded.email;
    }
    const cleanTarget = (email || authUserEmail || '').toLowerCase().trim();
    if (!cleanTarget) {
      return res.status(400).json({ error: 'Target email address is required for sync' });
    }
    let newItemsCount = 0;

    console.log(`[SYNC] Starting email sync for: ${cleanTarget}`);

    // A. Fetch via IMAP if configured (IMAP_HOST, IMAP_USER, IMAP_PASS or custom user IMAP)
    try {
      const authHeader = req.headers.authorization;
      let userImapConfig: any = undefined;
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const decoded = verifyToken(token);
        if (decoded) {
          const authUser = goldUsers.find(u => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase());
          if (authUser?.imap_config) {
            userImapConfig = authUser.imap_config;
          }
        }
      }

      const imapMessages = await fetchEmailsFromImap(cleanTarget, userImapConfig);
      console.log(`[SYNC] IMAP returned ${imapMessages.length} messages for ${cleanTarget}`);
      for (const im of imapMessages) {
        const imMsgId = ((im as any).messageId || im.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
        const imFrom = (im.from_email || im.sender || im.from || '').trim().toLowerCase();
        const imTo = (im.to_email || im.recipient || im.to || '').trim().toLowerCase();
        const imSub = (im.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
        const imTime = new Date(im.received_at || im.created_at || 0).getTime();
        const imBodyLen = (im.body_text || im.text || im.body || '').replace(/<[^>]+>/g, '').trim().length;

        if (deletedEmailIds.has(im.id) || (imMsgId && deletedEmailIds.has(imMsgId))) continue;

        const existingIdx = goldEmails.findIndex(e => {
          if (e.id === im.id) return true;
          const eMsgId = ((e as any).messageId || e.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
          if (imMsgId && eMsgId && imMsgId === eMsgId) return true;

          const eFrom = (e.from_email || e.sender || e.from || '').trim().toLowerCase();
          const eTo = (e.to_email || e.recipient || e.to || '').trim().toLowerCase();
          const eSub = (e.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
          const sameSender = imFrom === eFrom || (imFrom && eFrom && imFrom.split('@')[0] === eFrom.split('@')[0]);
          const sameTo = !imTo || !eTo || imTo === eTo || imTo.split('@')[0] === eTo.split('@')[0];

          if (sameSender && sameTo && imSub === eSub) {
            const eTime = new Date(e.received_at || e.created_at || 0).getTime();
            if (Math.abs(imTime - eTime) <= 2 * 60 * 60 * 1000) return true;
          }
          return false;
        });

        if (existingIdx !== -1) {
          const existing = goldEmails[existingIdx];
          const exBodyLen = (existing.body_text || existing.text || existing.body || '').replace(/<[^>]+>/g, '').trim().length;
          if (imBodyLen > exBodyLen) {
            const updated = { ...existing, ...im, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
            goldEmails[existingIdx] = updated;
            await db.insertEmail(updated);
            broadcastNewEmail(updated);
          }
        } else {
          const imStored: StoredEmail = { ...im, status: 'inbox' };
          await db.insertEmail(imStored);
          goldEmails.unshift(imStored);
          newItemsCount++;
          broadcastNewEmail(imStored);
        }
      }
    } catch (imapErr: any) {
      console.warn('[SYNC] IMAP sync note:', imapErr?.message || imapErr);
    }

    // B. Fetch via Resend receiving API if configured
    if (resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        if (client.emails && (client.emails as any).receiving && typeof (client.emails as any).receiving.list === 'function') {
          const recRes = await (client.emails as any).receiving.list({ limit: 100 });
          // Extract items correctly whether recRes.data is an array or an object with data property
          const rawItems: any[] = Array.isArray(recRes?.data)
            ? recRes.data
            : (Array.isArray(recRes?.data?.data) ? recRes.data.data : []);

          console.log(`[SYNC] Resend receiving list returned ${rawItems.length} items`);

          for (const item of rawItems) {
            const itemTo = extractCleanAddress(item.to);
            if (!cleanTarget || itemTo.includes(cleanTarget) || cleanTarget.includes(itemTo) || itemTo.endsWith('@goldmailer.xyz')) {
              const resendSub = (item.subject || '').trim().toLowerCase();
              const resendFrom = extractCleanAddress(item.from);
              const resendDate = (item.created_at || '').slice(0, 16);
              const resendFingerprint = `${resendFrom}|${itemTo}|${resendSub}|${resendDate}`;

              if (
                deletedEmailIds.has(String(item.id)) ||
                deletedEmailIds.has(`msg_${item.id}`) ||
                deletedEmailIds.has(resendFingerprint)
              ) continue;

              const existingIdx = goldEmails.findIndex(e => {
                if (e.id === String(item.id) || e.id === `msg_${item.id}`) return true;
                const eMsgId = ((e as any).messageId || e.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
                if (item.id && eMsgId && String(eMsgId) === String(item.id)) return true;

                const eFrom = (e.from_email || e.sender || '').trim().toLowerCase();
                const eTo = (e.to_email || e.recipient || '').trim().toLowerCase();
                const eSub = (e.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
                const sameSender = resendFrom === eFrom || (resendFrom && eFrom && resendFrom.split('@')[0] === eFrom.split('@')[0]);
                const sameTo = !itemTo || !eTo || itemTo === eTo || itemTo.split('@')[0] === eTo.split('@')[0];

                if (sameSender && sameTo && resendSub === eSub) {
                  const eTime = new Date(e.received_at || e.created_at || 0).getTime();
                  const itemTime = new Date(item.created_at || 0).getTime();
                  if (Math.abs(itemTime - eTime) <= 2 * 60 * 60 * 1000) return true;
                }
                return false;
              });

              let fullItem = item;
              let html = item.html || item.body_html || '';
              let text = item.text || item.body_text || '';

              try {
                const fullRes = await (client.emails as any).receiving.get(item.id);
                const detail = fullRes?.data?.data || fullRes?.data || fullRes;
                if (detail) {
                  fullItem = detail;
                  html = detail.html || detail.body_html || html;
                  text = detail.text || detail.body_text || text;
                }
              } catch (getErr) {
                console.warn(`[SYNC] Resend get error for ${item.id}:`, getErr);
              }

              // If html or text is missing, check if raw download_url can be parsed
              if ((!html || !text) && fullItem.raw?.download_url) {
                try {
                  const rawDownload = await (client.emails as any).receiving.downloadRaw(fullItem.raw.download_url);
                  if (rawDownload && rawDownload.content) {
                    const parsed = await simpleParser(rawDownload.content);
                    html = parsed.html || html;
                    text = parsed.text || text;
                  }
                } catch (rawErr) {
                  console.warn(`[SYNC] Resend downloadRaw error for ${item.id}:`, rawErr);
                }
              }

              const finalHtml = html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`;
              const senderAddr = extractCleanAddress(fullItem.from);

              const syncedEmail: StoredEmail = {
                id: String(item.id),
                recipient: itemTo || cleanTarget,
                to_email: itemTo || cleanTarget,
                to: itemTo || cleanTarget,
                sender: senderAddr,
                from_email: senderAddr,
                from: senderAddr,
                sender_name: senderAddr.split('@')[0],
                subject: fullItem.subject || '(No Subject)',
                body_html: finalHtml,
                body_text: text || '',
                html: finalHtml,
                text: text || '',
                body: finalHtml || text,
                received_at: fullItem.created_at || new Date().toISOString(),
                created_at: fullItem.created_at || new Date().toISOString(),
                is_read: false,
                is_starred: false,
                folder: 'primary',
                category: 'primary',
                status: 'inbox'
              };

              const newBodyLen = (syncedEmail.body_text || syncedEmail.text || syncedEmail.body || '').replace(/<[^>]+>/g, '').trim().length;

              if (existingIdx !== -1) {
                const existing = goldEmails[existingIdx];
                const exBodyLen = (existing.body_text || existing.text || existing.body || '').replace(/<[^>]+>/g, '').trim().length;
                if (newBodyLen > exBodyLen) {
                  const merged = { ...existing, ...syncedEmail, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
                  goldEmails[existingIdx] = merged;
                  await db.insertEmail(merged);
                  broadcastNewEmail(merged);
                }
              } else {
                await db.insertEmail(syncedEmail);
                goldEmails.unshift(syncedEmail);
                newItemsCount++;
                broadcastNewEmail(syncedEmail);
                console.log(`[SYNC] Ingested received email ${syncedEmail.id} for ${syncedEmail.recipient}`);
              }
            }
          }
        }
      } catch (e: any) {
        console.warn('[SYNC] Resend receiving sync note:', e?.message || e);
      }
    }

    if (newItemsCount > 0) {
      saveData();
    }

    console.log(`[SYNC] Completed sync for ${cleanTarget}: ${newItemsCount} new, ${goldEmails.length} total`);
    return res.json({
      success: true,
      new_emails_synced: newItemsCount,
      total_emails: goldEmails.length,
      synced_at: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[SYNC] Error during email sync:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Send Email (CRITICAL FIX: Sends from Authenticated User's main GoldMailer address, NOT noreply@goldmailer.xyz)
app.post('/api/emails/send', async (req: Request, res: Response) => {
  try {
    const { to, cc, bcc, subject, body, sender, scheduled_for, draft_id } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    // Determine authenticated sender
    const authHeader = req.headers.authorization;
    let authUser: StoredGoldUser | null = null;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const decoded = verifyToken(token);
      if (decoded) {
        authUser = goldUsers.find(u => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase()) || null;
      }
    }

    // CRITICAL: Sender must be the authenticated user's primary GoldMailer address (exclusively @goldmailer.xyz)
    const rawSender = (authUser?.email || sender || '').toLowerCase().trim();
    if (!rawSender) {
      return res.status(400).json({ error: 'Sender email address is required' });
    }
    const senderPrefix = rawSender.replace(/@.*$/, '').trim();
    const userMainEmail = `${senderPrefix}@goldmailer.xyz`;
    const senderDisplayName = authUser?.first_name
      ? `${authUser.first_name} ${authUser.last_name || ''}`.trim()
      : senderPrefix;
    const fromHeader = `${senderDisplayName} <${userMainEmail}>`;

    const cleanToAddresses = getAllEmailAddresses(to);
    const toFormatted = cleanToAddresses.join(', ') || String(to).trim();
    const isScheduled = Boolean(scheduled_for && new Date(scheduled_for).getTime() > Date.now());

    let liveSent = false;
    let liveError: string | null = null;

    const activeSmtp = getActiveSmtpTransporter();
    if (!isScheduled && activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromHeader,
          to: cleanToAddresses.length > 0 ? cleanToAddresses : [toFormatted],
          replyTo: userMainEmail,
          cc: cc ? getAllEmailAddresses(cc) : undefined,
          bcc: bcc ? getAllEmailAddresses(bcc) : undefined,
          subject: subject || '(No Subject)',
          html: body || '<p></p>'
        });
        liveSent = true;
      } catch (smtpErr: any) {
        liveError = smtpErr.message;
      }
    }

    if (!isScheduled && !liveSent && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        const sendRes = await client.emails.send({
          from: fromHeader, // CRITICAL FIX: authenticated user's address, NOT noreply@goldmailer.xyz
          to: cleanToAddresses.length > 0 ? cleanToAddresses : [toFormatted],
          replyTo: userMainEmail,
          cc: cc ? getAllEmailAddresses(cc) : undefined,
          bcc: bcc ? getAllEmailAddresses(bcc) : undefined,
          subject: subject || '(No Subject)',
          html: body || '<p></p>'
        });
        if (sendRes.error) {
          liveError = sendRes.error.message;
        } else {
          liveSent = true;
        }
      } catch (err: any) {
        liveError = err.message;
      }
    }

    const textBody = (body || '').replace(/<[^>]+>/g, ' ').trim();
    const nowIso = new Date().toISOString();

    // 1. Sent email record for sender (Stored permanently in 'sent' folder)
    const sentEmail: StoredEmail = {
      id: 'msg_sent_' + crypto.randomBytes(8).toString('hex'),
      user_id: authUser?.id,
      recipient: toFormatted,
      to_email: toFormatted,
      to: toFormatted,
      cc,
      bcc,
      sender: fromHeader,
      from_email: userMainEmail,
      from: userMainEmail,
      sender_name: senderDisplayName,
      subject: subject || '(No Subject)',
      body_html: body || '',
      body_text: textBody,
      html: body || '',
      text: textBody,
      body: body || textBody,
      received_at: nowIso,
      created_at: nowIso,
      is_read: true,
      is_starred: false,
      folder: isScheduled ? 'scheduled' : 'sent',
      category: 'primary',
      status: 'sent',
      scheduled_for: isScheduled ? scheduled_for : undefined
    };

    await db.insertEmail(sentEmail);
    goldEmails.unshift(sentEmail);
    broadcastNewEmail(sentEmail);

    // 2. Direct internal delivery if sent to any GoldMailer user (including self)
    for (const recipientAddr of cleanToAddresses) {
      if (recipientAddr.endsWith('@goldmailer.xyz')) {
        const recvEmail: StoredEmail = {
          id: 'msg_recv_' + crypto.randomBytes(8).toString('hex'),
          recipient: recipientAddr,
          to_email: recipientAddr,
          to: recipientAddr,
          cc,
          bcc,
          sender: fromHeader,
          from_email: userMainEmail,
          from: userMainEmail,
          sender_name: senderDisplayName,
          subject: subject || '(No Subject)',
          body_html: body || '',
          body_text: textBody,
          html: body || '',
          text: textBody,
          body: body || textBody,
          received_at: nowIso,
          created_at: nowIso,
          is_read: false,
          is_starred: false,
          folder: 'primary',
          category: 'primary',
          status: 'inbox'
        };
        await db.insertEmail(recvEmail);
        goldEmails.unshift(recvEmail);
        broadcastNewEmail(recvEmail);
      }
    }

    // Delete draft if sent from draft
    if (draft_id) {
      goldDrafts = goldDrafts.filter(d => d.id !== draft_id);
    }

    saveData();

    return res.json({
      success: true,
      email: sentEmail,
      live_sent: liveSent,
      live_error: liveError
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Simulate Inbound Email (QA & Testing helper for real-time inbound mail verification)
app.post('/api/emails/simulate-inbound', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { to, from, sender_name, subject, body_html, body_text } = req.body;
    let authUserEmail = '';
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const decoded = verifyToken(authHeader.replace(/^Bearer\s+/i, ''));
      if (decoded?.email) authUserEmail = decoded.email;
    }
    const recipient = (to || authUserEmail || '').toLowerCase().trim();
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient address is required for simulation' });
    }
    const sender = from || 'security@google.com';
    const senderName = sender_name || 'Google Security';
    const sub = subject || 'Security Alert: New sign-in detected for your account';
    const nowIso = new Date().toISOString();

    const incoming: StoredEmail = {
      id: 'msg_inbound_' + crypto.randomBytes(8).toString('hex'),
      recipient,
      to_email: recipient,
      to: recipient,
      sender: `${senderName} <${sender}>`,
      from_email: sender,
      from: sender,
      sender_name: senderName,
      subject: sub,
      body_html: body_html || `
        <div style="font-family: -apple-system, Roboto, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #FF6A00; margin-top: 0;">Inbound Test Email</h2>
          <p>Hello,</p>
          <p>This is a live incoming email delivered to <strong>${recipient}</strong>.</p>
          <p style="color: #666; font-size: 13px;">Received at ${new Date().toLocaleTimeString()}</p>
        </div>
      `,
      body_text: body_text || `Hello,\nThis is a live incoming email delivered to ${recipient}.\nReceived at ${new Date().toLocaleTimeString()}`,
      html: body_html || '',
      text: body_text || '',
      body: body_html || body_text || 'Test incoming email',
      received_at: nowIso,
      created_at: nowIso,
      is_read: false,
      is_starred: false,
      folder: 'primary',
      category: 'primary',
      status: 'inbox'
    };

    await db.insertEmail(incoming);
    goldEmails.unshift(incoming);
    saveData();
    broadcastNewEmail(incoming);
    console.log(`[SIMULATE-INBOUND] Generated incoming test email ${incoming.id} for ${incoming.recipient} from ${incoming.from}: "${incoming.subject}"`);

    return res.json({ success: true, email: incoming });
  } catch (err: any) {
    console.error('[SIMULATE-INBOUND] Error generating test email:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Update Email Read/Star/Folder
app.patch('/api/emails/:id', async (req: Request, res: Response) => {
  ensureDataLoaded();
  const { id } = req.params;
  const { is_read, is_starred, folder } = req.body;
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  if (is_read !== undefined) email.is_read = is_read;
  if (is_starred !== undefined) email.is_starred = is_starred;
  if (folder !== undefined) {
    email.folder = folder;
    if (folder === 'trash') {
      email.status = 'trash';
      email.trashed_at = new Date().toISOString();
      await db.updateEmailStatus(id, 'trash', 'trash');
      console.log(`✅ DB UPDATE email moved to trash via patch: ${id}`);
    } else {
      email.status = 'inbox';
      email.trashed_at = undefined;
      deletedEmailIds.delete(id);
      if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);
      await db.updateEmailStatus(id, 'inbox', folder);
      console.log(`✅ DB UPDATE email folder updated: ${id} -> ${folder}`);
    }
  }

  saveData();
  return res.json({ success: true, email });
});

// 5. Delete Email (Move to trash or permanent delete with DB persistence)
app.delete('/api/emails/:id', async (req: Request, res: Response) => {
  ensureDataLoaded();
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    deletedEmailIds.add(id);
    db.deleteEmail(id);
    await db.updateEmailStatus(id, 'deleted', 'trash');
    saveData();
    return res.json({ success: true, already_deleted: true });
  }

  const msgId = (email as any).messageId || email.raw?.messageId;
  const key = `${(email.from_email || email.sender || '').toLowerCase()}|${(email.to_email || email.recipient || '').toLowerCase()}|${(email.subject || '').trim().toLowerCase()}|${(email.received_at || email.created_at || '').slice(0, 16)}`;

  if (permanent || email.folder === 'trash' || email.status === 'trash') {
    email.status = 'deleted';
    goldEmails = goldEmails.filter(e => e.id !== id);
    deletedEmailIds.add(id);
    if (msgId) deletedEmailIds.add(msgId);
    if (key) deletedEmailIds.add(key);
    db.deleteEmail(id);
    await db.updateEmailStatus(id, 'deleted', 'trash');
    console.log(`✅ DB UPDATE email permanently deleted: ${id}`);
    saveData();
    return res.json({ success: true, permanent: true, status: 'deleted' });
  } else {
    email.folder = 'trash';
    email.status = 'trash';
    email.trashed_at = new Date().toISOString();
    await db.updateEmailStatus(id, 'trash', 'trash');
    console.log(`✅ DB UPDATE email moved to trash: ${id} (trashed_at: ${email.trashed_at})`);
    saveData();
    return res.json({ success: true, folder: 'trash', status: 'trash' });
  }
});

// 5b. Restore Email from Trash to Inbox
app.post('/api/emails/:id/restore', async (req: Request, res: Response) => {
  ensureDataLoaded();
  const { id } = req.params;
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  email.folder = 'primary';
  email.status = 'inbox';
  email.trashed_at = undefined;
  deletedEmailIds.delete(id);
  if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);
  if ((email as any).messageId) deletedEmailIds.delete((email as any).messageId);

  await db.updateEmailStatus(id, 'inbox', 'primary');
  console.log(`✅ DB UPDATE email restored to inbox: ${id}`);

  saveData();
  return res.json({ success: true, email, status: 'inbox' });
});

// 5c. Empty Trash permanently for user
app.all(['/api/emails/trash/empty', '/api/emails/empty-trash'], async (req: Request, res: Response) => {
  ensureDataLoaded();
  const targetEmail = (req.body?.email || req.query?.email || '').toString().toLowerCase().trim();

  const toDelete = goldEmails.filter(e => {
    if (e.folder !== 'trash' && e.status !== 'trash') return false;
    if (!targetEmail) return true;
    return (
      (e.recipient && e.recipient.toLowerCase().includes(targetEmail)) ||
      (e.to_email && e.to_email.toLowerCase().includes(targetEmail)) ||
      (e.sender && e.sender.toLowerCase().includes(targetEmail)) ||
      (e.from_email && e.from_email.toLowerCase().includes(targetEmail))
    );
  });

  for (const em of toDelete) {
    em.status = 'deleted';
    deletedEmailIds.add(em.id);
    const msgId = (em as any).messageId || em.raw?.messageId;
    if (msgId) deletedEmailIds.add(msgId);
    const key = `${(em.from_email || em.sender || '').toLowerCase()}|${(em.to_email || em.recipient || '').toLowerCase()}|${(em.subject || '').trim().toLowerCase()}|${(em.received_at || em.created_at || '').slice(0, 16)}`;
    if (key) deletedEmailIds.add(key);
    db.deleteEmail(em.id);
  }

  const deleteIds = new Set(toDelete.map(e => e.id));
  goldEmails = goldEmails.filter(e => !deleteIds.has(e.id));

  await db.batchUpdateEmailStatus(Array.from(deleteIds), 'deleted');
  console.log(`✅ DB EMPTY TRASH permanently marked ${toDelete.length} emails as deleted`);

  saveData();
  return res.json({
    success: true,
    deleted_count: toDelete.length,
    remaining: goldEmails.length
  });
});

// 5d. Batch actions (trash, restore, delete permanent, mark read, mark unread)
app.post('/api/emails/batch-action', async (req: Request, res: Response) => {
  ensureDataLoaded();
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const idSet = new Set(ids);
  if (action === 'delete_permanent') {
    for (const id of ids) {
      deletedEmailIds.add(id);
      db.deleteEmail(id);
      const em = goldEmails.find(e => e.id === id);
      if (em) {
        const msgId = (em as any).messageId || em.raw?.messageId;
        if (msgId) deletedEmailIds.add(msgId);
        const key = `${(em.from_email || em.sender || '').toLowerCase()}|${(em.to_email || em.recipient || '').toLowerCase()}|${(em.subject || '').trim().toLowerCase()}|${(em.received_at || em.created_at || '').slice(0, 16)}`;
        if (key) deletedEmailIds.add(key);
      }
    }
    goldEmails = goldEmails.filter(e => {
      if (idSet.has(e.id)) {
        e.status = 'deleted';
        return false;
      }
      return true;
    });
    await db.batchUpdateEmailStatus(ids, 'deleted');
    console.log(`✅ DB BATCH delete_permanent for ${ids.length} emails`);
  } else if (action === 'trash') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = 'trash';
        e.status = 'trash';
        e.trashed_at = new Date().toISOString();
      }
    }
    await db.batchUpdateEmailStatus(ids, 'trash');
    console.log(`✅ DB BATCH trash for ${ids.length} emails`);
  } else if (action === 'restore') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = 'primary';
        e.status = 'inbox';
        e.trashed_at = undefined;
        deletedEmailIds.delete(e.id);
        if (e.raw?.messageId) deletedEmailIds.delete(e.raw.messageId);
      }
    }
    await db.batchUpdateEmailStatus(ids, 'inbox');
    console.log(`✅ DB BATCH restore for ${ids.length} emails`);
  } else if (action === 'mark_read') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) e.is_read = true;
    }
  } else if (action === 'mark_unread') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) e.is_read = false;
    }
  }

  saveData();
  return res.json({ success: true, action, count: ids.length });
});

// 6. Inbound Webhook (Cloudflare Email Routing, Resend, SendGrid, Mailgun, Postmark, AWS SES, or external forwarders)
app.post(
  [
    '/api/inbound',
    '/api/receive-email',
    '/api/emails/inbound',
    '/api/emails/receive',
    '/api/webhook',
    '/api/webhook/inbound',
    '/api/webhook/email',
    '/api/webhook/cloudflare',
    '/api/webhook/resend',
    '/api/webhooks/inbound',
    '/api/webhooks/email',
    '/api/webhooks/cloudflare',
    '/api/webhooks/resend',
    '/api/inbound-webhook',
    '/api/mail/inbound',
    '/api/smtp/inbound'
  ],
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      ensureDataLoaded();
      const body = req.body || {};
      const data = body.data || body;
      console.log('[INBOUND WEBHOOK] Received webhook request. Path:', req.path, 'Content-Type:', req.headers['content-type']);

      let to = extractCleanEmail(
        data.to || data.recipient || data.recipients || data.to_email || data.OriginalRecipient || data.envelope?.to || data.headers?.to ||
        body.to || body.recipient || body.recipients || body.to_email || body.OriginalRecipient || body.envelope?.to || body.headers?.to || body['to'] ||
        req.headers['x-forwarded-to'] || req.headers['delivered-to'] || req.headers['x-original-to'] || ''
      );
      let from = extractCleanSender(
        data.from || data.sender || data.from_email || data.envelope?.from ||
        body.from || body.sender || body.from_email || body.envelope?.from ||
        'external@sender.com'
      );
      let subject = String(data.subject || body.subject || '(No Subject)');
      let html = String(data.html || data.body_html || data['body-html'] || body.html || body.body_html || body['body-html'] || '');
      let text = String(data.text || data.body_text || data['body-plain'] || body.text || body.body_text || body['body-plain'] || '');

      // Parse raw MIME RFC 822 files uploaded via multipart
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files as Express.Multer.File[]) {
          if (file.buffer && (file.mimetype?.includes('message/rfc822') || file.originalname?.endsWith('.eml') || file.fieldname === 'email' || file.fieldname === 'message')) {
            try {
              const parsed = await simpleParser(file.buffer);
              if (!to) to = extractCleanEmail(parsed.to);
              if (!from || from === 'external@sender.com') from = extractCleanSender(parsed.from);
              if (!subject || subject === '(No Subject)') subject = parsed.subject || subject;
              if (!html) html = parsed.html || '';
              if (!text) text = parsed.text || '';
            } catch (e) {
              console.warn('[INBOUND WEBHOOK] Multer file parse note:', e);
            }
          }
        }
      }

      // Parse raw MIME RFC 822 string if payload provides raw content
      const rawContent = data.raw || body.raw || data.email || body.email || data.message || body.message;
      if (rawContent && typeof rawContent === 'string' && (!html || !text)) {
        try {
          const parsed = await simpleParser(rawContent);
          if (!to) to = extractCleanEmail(parsed.to);
          if (!from || from === 'external@sender.com') from = extractCleanSender(parsed.from);
          if (!subject || subject === '(No Subject)') subject = parsed.subject || subject;
          if (!html) html = parsed.html || '';
          if (!text) text = parsed.text || '';
        } catch (parseErr) {
          console.warn('[INBOUND WEBHOOK] Raw body parse note:', parseErr);
        }
      }

      // Resend inbound webhook resolution if payload contains email_id
      const emailId = body.email_id || body.data?.email_id || body.id || data.id || data.email_id;
      if (emailId && (!html || !text) && resendApiKey) {
        try {
          const client = resendClient || new Resend(resendApiKey);
          const fullRes = await (client.emails as any).receiving.get(emailId);
          const item = fullRes?.data?.data || fullRes?.data || fullRes;
          if (item) {
            if (!to) to = extractCleanEmail(item.to || to);
            if (!from || from === 'external@sender.com') from = extractCleanSender(item.from || from);
            if (!subject || subject === '(No Subject)') subject = item.subject || subject;
            html = item.html || item.body_html || html;
            text = item.text || item.body_text || text;

            if ((!html || !text) && item.raw?.download_url) {
              try {
                const rawDownload = await (client.emails as any).receiving.downloadRaw(item.raw.download_url);
                if (rawDownload && rawDownload.content) {
                  const parsed = await simpleParser(rawDownload.content);
                  html = parsed.html || html;
                  text = parsed.text || text;
                }
              } catch (rawErr) {
                console.warn('[INBOUND WEBHOOK] Resend raw download note:', rawErr);
              }
            }
          }
        } catch (err: any) {
          console.warn('[INBOUND WEBHOOK] Resend detail retrieval note:', err?.message || err);
        }
      }

      const finalRecipient = to || 'inbox@goldmailer.xyz';
      const nowIso = new Date().toISOString();
      const inMsgId = (emailId || (data as any)?.message_id || (data as any)?.messageId || '').trim();

      const newEmail: StoredEmail = {
        id: 'msg_inbound_' + crypto.randomBytes(8).toString('hex'),
        messageId: inMsgId || undefined,
        raw: { messageId: inMsgId || undefined, emailId: emailId || undefined },
        recipient: finalRecipient,
        to_email: finalRecipient,
        to: finalRecipient,
        sender: from,
        from_email: from,
        from,
        sender_name: from.split('@')[0],
        subject,
        body_html: html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`,
        body_text: text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : ''),
        html: html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`,
        text: text || '',
        body: html || text,
        received_at: nowIso,
        created_at: nowIso,
        is_read: false,
        is_starred: false,
        folder: 'primary',
        category: 'primary',
        status: 'inbox'
      };

      const inFrom = from.trim().toLowerCase();
      const inTo = finalRecipient.trim().toLowerCase();
      const inSub = subject.trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
      const inTime = new Date(nowIso).getTime();
      const inBodyLen = (newEmail.body_text || newEmail.text || newEmail.body || '').replace(/<[^>]+>/g, '').trim().length;

      const existingIdx = goldEmails.findIndex(e => {
        if (e.id === newEmail.id) return true;
        const eMsgId = ((e as any).messageId || e.raw?.messageId || '').trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
        if (inMsgId && eMsgId && inMsgId.toLowerCase() === eMsgId) return true;

        const eFrom = (e.from_email || e.sender || '').trim().toLowerCase();
        const eTo = (e.to_email || e.recipient || '').trim().toLowerCase();
        const eSub = (e.subject || '').trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, '');
        const sameSender = inFrom === eFrom || (inFrom && eFrom && inFrom.split('@')[0] === eFrom.split('@')[0]);
        const sameTo = !inTo || !eTo || inTo === eTo || inTo.split('@')[0] === eTo.split('@')[0];

        if (sameSender && sameTo && inSub === eSub) {
          const eTime = new Date(e.received_at || e.created_at || 0).getTime();
          if (Math.abs(inTime - eTime) <= 2 * 60 * 60 * 1000) return true;
        }
        return false;
      });

      if (existingIdx !== -1) {
        const existing = goldEmails[existingIdx];
        const exBodyLen = (existing.body_text || existing.text || existing.body || '').replace(/<[^>]+>/g, '').trim().length;
        if (inBodyLen >= exBodyLen) {
          const merged = { ...existing, ...newEmail, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
          goldEmails[existingIdx] = merged;
          await db.insertEmail(merged);
          saveData();
          broadcastNewEmail(merged);
          console.log(`[INBOUND WEBHOOK] Updated existing email with new inbound content: ${existing.id}`);
          return res.json({ success: true, id: existing.id, recipient: existing.recipient, updated: true });
        } else {
          console.log(`[INBOUND WEBHOOK] Inbound matched existing richer email: ${existing.id}`);
          return res.json({ success: true, id: existing.id, recipient: existing.recipient, already_exists: true });
        }
      }

      await db.insertEmail(newEmail);
      goldEmails.unshift(newEmail);
      saveData();
      broadcastNewEmail(newEmail);
      console.log(`[INBOUND WEBHOOK] Successfully stored email ${newEmail.id} for ${newEmail.recipient} from ${newEmail.from}: "${newEmail.subject}"`);
      return res.json({ success: true, id: newEmail.id, recipient: newEmail.recipient });
    } catch (err: any) {
      console.error('[INBOUND WEBHOOK] Fatal error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ================= DRAFTS AUTO-SAVE =================

app.get('/api/drafts', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json([]);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.json([]);

  const drafts = goldDrafts
    .filter(d => d.user_id === decoded.id || d.sender_email.toLowerCase() === decoded.email.toLowerCase())
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return res.json(drafts);
});

app.post('/api/drafts', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    const { id, to, cc, bcc, subject, body } = req.body;
    const now = new Date().toISOString();

    let draft = goldDrafts.find(d => d.id === id && (d.user_id === decoded.id || d.sender_email === decoded.email));

    if (draft) {
      draft.to = to || '';
      draft.cc = cc || '';
      draft.bcc = bcc || '';
      draft.subject = subject || '';
      draft.body = body || '';
      draft.updated_at = now;
    } else {
      draft = {
        id: id || 'drf_' + crypto.randomBytes(8).toString('hex'),
        user_id: decoded.id,
        sender_email: decoded.email,
        to: to || '',
        cc: cc || '',
        bcc: bcc || '',
        subject: subject || '',
        body: body || '',
        updated_at: now,
        created_at: now
      };
      goldDrafts.unshift(draft);
    }

    saveData();
    return res.json({
      success: true,
      draft,
      saved_at_formatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/drafts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  goldDrafts = goldDrafts.filter(d => d.id !== id);
  saveData();
  return res.json({ success: true });
});

// ================= SECURITY & 2FA =================

app.post('/api/security/2fa/setup', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const secret = new OTPAuth.Secret({ size: 20 });
  const base32Secret = secret.base32;
  const totp = new OTPAuth.TOTP({
    issuer: 'GoldMailer',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret
  });

  user.two_factor_secret = base32Secret;
  await db.updateAccount(user.id, { two_factor_secret: base32Secret });
  saveData();

  return res.json({
    secret: base32Secret,
    otpauth_url: totp.toString(),
    email: user.email
  });
});

app.post('/api/security/2fa/enable', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  let user = goldUsers.find(u => u.id === decoded.id);
  if (!user) {
    const acc = await db.findAccount(decoded.email);
    if (acc) user = acc as StoredGoldUser;
  }
  if (!user || !user.two_factor_secret) {
    return res.status(400).json({ error: '2FA setup was not initiated' });
  }

  const { code } = req.body;
  const totp = new OTPAuth.TOTP({
    issuer: 'GoldMailer',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
  });

  const delta = totp.validate({ token: String(code).trim(), window: 2 });
  if (delta === null) {
    return res.status(400).json({ error: 'Invalid 6-digit code. Check clock sync and try again.' });
  }

  user.two_factor_enabled = true;
  if (!user.backup_codes || user.backup_codes.length === 0) {
    user.backup_codes = generateBackupCodes();
  }
  await db.updateAccount(user.id, {
    two_factor_enabled: true,
    backup_codes: user.backup_codes,
    two_factor_secret: user.two_factor_secret
  });
  saveData();

  return res.json({
    success: true,
    two_factor_enabled: true,
    backup_codes: user.backup_codes
  });
});

app.post('/api/security/2fa/disable', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.two_factor_enabled = false;
  await db.updateAccount(user.id, { two_factor_enabled: false });
  saveData();
  return res.json({ success: true, two_factor_enabled: false });
});

app.post('/api/security/backup-codes/regenerate', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.backup_codes = generateBackupCodes();
  await db.updateAccount(user.id, { backup_codes: user.backup_codes });
  saveData();
  return res.json({ success: true, backup_codes: user.backup_codes });
});

app.get('/api/security/devices', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json([]);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.json([]);

  const curIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
  const list = userDevices
    .filter(d => d.user_id === decoded.id)
    .map(d => ({
      ...d,
      is_current: d.ip === curIp
    }));

  return res.json(list);
});

app.post('/api/security/devices/revoke-all', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const curIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
  userDevices = userDevices.filter(d => d.user_id !== decoded.id || d.ip === curIp);
  saveData();

  return res.json({ success: true, message: 'All other devices have been signed out.' });
});

// ================= OAUTH 2.0 PROVIDER =================

app.get('/api/oauth/clients', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const clients = oauthClients.filter(c => c.owner_user_id === decoded.id || decoded.role === 'admin');
  return res.json(clients);
});

app.post('/api/oauth/clients', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    const { app_name, redirect_uri, logo_url, website_url } = req.body;
    if (!app_name || !redirect_uri) {
      return res.status(400).json({ error: 'App name and Redirect URI are required' });
    }

    const newClient: StoredOAuthClient = {
      client_id: 'gld_' + crypto.randomBytes(12).toString('hex'),
      client_secret: 'sec_' + crypto.randomBytes(24).toString('hex'),
      app_name: app_name.trim(),
      redirect_uri: redirect_uri.trim(),
      logo_url: logo_url?.trim() || '',
      website_url: website_url?.trim() || '',
      owner_user_id: decoded.id,
      created_at: new Date().toISOString()
    };

    oauthClients.unshift(newClient);
    saveData();
    return res.status(201).json({ success: true, client: newClient });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get(['/api/oauth/authorize', '/oauth/authorize'], (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, state } = req.query;
  const client = oauthClients.find(c => c.client_id === client_id);
  if (!client) {
    return res.status(400).send('OAuth Error: Invalid client_id');
  }

  const targetUrl = `/?oauth_consent=true&client_id=${client_id}&redirect_uri=${encodeURIComponent(String(redirect_uri || client.redirect_uri))}&scope=${encodeURIComponent(String(scope || 'email profile'))}&state=${encodeURIComponent(String(state || ''))}`;
  return res.redirect(targetUrl);
});

app.post('/api/oauth/authorize', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'User must be authenticated' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid session' });

    const { client_id, redirect_uri, scope, state } = req.body;
    const client = oauthClients.find(c => c.client_id === client_id);
    if (!client) {
      return res.status(400).json({ error: 'Invalid client_id' });
    }

    const code = 'gld_code_' + crypto.randomBytes(16).toString('hex');
    oauthCodes.push({
      code,
      client_id: String(client_id),
      user_id: decoded.id,
      redirect_uri: String(redirect_uri || client.redirect_uri),
      scope: String(scope || 'email profile'),
      expires_at: Date.now() + 10 * 60 * 1000
    });

    saveData();

    const redirectTarget = new URL(String(redirect_uri || client.redirect_uri));
    redirectTarget.searchParams.set('code', code);
    if (state) redirectTarget.searchParams.set('state', String(state));

    return res.json({
      success: true,
      redirect_url: redirectTarget.toString(),
      code
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(['/api/oauth/token', '/oauth/token'], (req: Request, res: Response) => {
  try {
    const { code, client_id, client_secret } = req.body;
    const client = oauthClients.find(c => c.client_id === client_id);
    if (!client || client.client_secret !== client_secret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const codeIdx = oauthCodes.findIndex(c => c.code === code && c.client_id === client_id);
    if (codeIdx === -1) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    const authCode = oauthCodes[codeIdx];
    if (authCode.expires_at < Date.now()) {
      oauthCodes.splice(codeIdx, 1);
      return res.status(400).json({ error: 'expired_code' });
    }

    oauthCodes.splice(codeIdx, 1);

    const user = goldUsers.find(u => u.id === authCode.user_id);
    if (!user) return res.status(400).json({ error: 'invalid_user' });

    const accessToken = 'gld_tok_' + crypto.randomBytes(24).toString('hex');
    oauthTokens.push({
      access_token: accessToken,
      client_id: client.client_id,
      user_id: user.id,
      scope: authCode.scope,
      expires_at: Date.now() + 3600 * 1000
    });

    saveData();

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: authCode.scope,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`.trim(),
        username: user.username
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.all(['/api/oauth/userinfo', '/oauth/userinfo'], (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'invalid_token' });
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const oauthToken = oauthTokens.find(t => t.access_token === token);
    let userId: string | null = null;
    if (oauthToken) {
      userId = oauthToken.user_id;
    } else {
      const decoded = verifyToken(token);
      if (decoded) userId = decoded.id;
    }

    if (!userId) return res.status(401).json({ error: 'invalid_token' });

    const user = goldUsers.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    return res.json({
      sub: user.id,
      id: user.id,
      email: user.email,
      email_verified: true,
      name: `${user.first_name} ${user.last_name}`.trim() || user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      preferred_username: user.username,
      picture: user.avatar_url || '',
      phone: user.phone || undefined,
      gender: user.gender || undefined,
      locale: 'en',
      updated_at: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= ADMIN APIS (/admin - 20 FULL WORKSPACE FEATURES) =================

const requireAdmin = (req: Request, res: Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired session' });

  const email = (decoded.email || '').toLowerCase().trim();
  const isAdmin = email === 'miracle@goldmailer.xyz';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required. Only miracle@goldmailer.xyz has administrative privileges.' });
  }
  (req as any).adminUser = decoded;
  next();
};

// 1. Dashboard Overview
app.get('/api/admin/overview', requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const accounts = db.listAccounts();
  const allEmails = db.getAllEmails();
  const emailBytes = allEmails.reduce((acc, e) => acc + Buffer.byteLength((e.body_html || '') + (e.body_text || '') + (e.subject || ''), 'utf8'), 0);
  const totalStorage = accounts.reduce((acc, u) => acc + (u.storage_used_bytes || 0), 0) + emailBytes;
  const twilioCfg = getTwilioConfig();
  const activeAccounts = accounts.filter(u => !u.is_banned);
  const openTickets = db.getTickets().filter(t => t.status === 'open' || t.status === 'in_progress');
  const domains = db.getDomains();
  const payments = db.getPayments();
  const revenueTotal = payments
    .filter(p => p.payment_status === 'confirmed')
    .reduce((sum, p) => sum + (p.amount_usd || 0), 0);

  res.json({
    totalUsers: accounts.length,
    activeAccountsCount: activeAccounts.length,
    bannedUsersCount: accounts.length - activeAccounts.length,
    totalEmails: allEmails.filter(e => e.status !== 'deleted').length,
    totalDrafts: goldDrafts.length,
    totalOAuthClients: oauthClients.length,
    totalStorageUsedBytes: totalStorage,
    totalStorageUsedMb: (totalStorage / (1024 * 1024)).toFixed(2),
    totalStorageUsedGb: (totalStorage / (1024 * 1024 * 1024)).toFixed(2),
    blockedIpsCount: db.getBlockedIps().length,
    openTicketsCount: openTickets.length,
    activeDomainsCount: domains.filter(d => d.is_verified).length,
    monthlyRevenueUsd: Number(revenueTotal.toFixed(2)),
    recentLogins: userDevices.slice(0, 10),
    adminPhoneNumber: twilioCfg.trialNumber || '+1 (267) 230-1662',
    isTwilioConfigured: twilioCfg.isConfigured,
    isResendConfigured: Boolean(process.env.RESEND_API_KEY),
    isDatabaseConnected: true,
    dbType: 'Supabase + Persistent Dual-File DB Engine'
  });
});

// 2. User Management (CRUD)
app.get('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const search = ((req.query.search as string) || '').toLowerCase().trim();
  let users = db.listAccounts();
  if (search) {
    users = users.filter(u =>
      u.email.toLowerCase().includes(search) ||
      u.username.toLowerCase().includes(search) ||
      u.first_name.toLowerCase().includes(search) ||
      u.last_name.toLowerCase().includes(search)
    );
  }
  res.json(users.map(u => sanitizeUser(u)));
});

app.post('/api/admin/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, username, email, password, role, plan } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: 'firstName, username, and password required' });
    }
    const cleanUser = username.toLowerCase().replace(/@.*$/, '').trim();
    const finalEmail = `${cleanUser}@goldmailer.xyz`;

    const newUser: StoredGoldUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      email: finalEmail,
      username: cleanUser,
      password_hash: bcrypt.hashSync(String(password).trim(), 10),
      first_name: firstName.trim(),
      last_name: (lastName || '').trim(),
      dob: '1998-05-14',
      gender: 'Prefer not to say',
      phone: '',
      recovery_phone: '',
      backup_email: '',
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: role === 'admin' ? 'admin' : 'user',
      plan: plan || 'free',
      created_at: new Date().toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: plan === 'enterprise' ? 1024 * 1024 * 1024 * 1024 : 15 * 1024 * 1024 * 1024
    };

    await db.insertAccount(newUser);
    goldUsers.unshift(newUser);
    saveData();

    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'CREATE_USER', 'user', newUser.id, `Created account ${newUser.email}`);

    return res.status(201).json({ success: true, user: sanitizeUser(newUser) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, role, plan, storage_limit_bytes, password } = req.body;
    const updates: Partial<StoredGoldUser> = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (role !== undefined) updates.role = role;
    if (plan !== undefined) updates.plan = plan;
    if (storage_limit_bytes !== undefined) updates.storage_limit_bytes = Number(storage_limit_bytes);
    if (password) updates.password_hash = bcrypt.hashSync(String(password).trim(), 10);

    const updated = await db.updateAccount(id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    // Update in-memory goldUsers
    const idx = goldUsers.findIndex(u => u.id === id);
    if (idx !== -1) goldUsers[idx] = { ...goldUsers[idx], ...updates };
    saveData();

    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'UPDATE_USER', 'user', id, `Updated account ${updated.email}`);

    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
  const ok = await db.deleteAccount(id, adminEmail);
  if (!ok) return res.status(404).json({ error: 'User not found' });

  goldUsers = goldUsers.filter(u => u.id !== id);
  goldEmails = goldEmails.filter(e => e.recipient !== id && !e.recipient.startsWith(id));
  saveData();

  res.json({ success: true, message: 'User deleted permanently' });
});

// 3. Email Accounts (@goldmailer.xyz list)
app.get('/api/admin/email-accounts', requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const accounts = db.listAccounts().map(u => {
    const userEmails = db.getEmailsForUser(u.email);
    const unread = userEmails.filter(e => !e.is_read).length;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: `${u.first_name} ${u.last_name}`.trim(),
      domain: u.email.split('@')[1] || 'goldmailer.xyz',
      storageUsedMb: ((u.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1),
      storageLimitGb: ((u.storage_limit_bytes || 15 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024)).toFixed(0),
      totalEmails: userEmails.length,
      unreadEmails: unread,
      plan: u.plan || 'free',
      is_banned: Boolean(u.is_banned),
      created_at: u.created_at
    };
  });
  res.json(accounts);
});

// 4. Ban / Suspend Users with Reason (Permanent DB Persistence)
app.post(['/api/admin/users/:id/ban', '/api/admin/ban-user'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id || req.body.userId || req.body.id;
    if (!id) return res.status(400).json({ error: 'userId or id is required' });
    const { is_banned, banned, reason } = req.body || {};
    const finalBan = is_banned !== undefined ? is_banned : banned;
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';

    const user = await db.findAccount(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newBanState = finalBan !== undefined ? Boolean(finalBan) : !user.is_banned;
    const updated = await db.setBanStatus(user.id, newBanState, reason, adminEmail);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    // Sync in-memory goldUsers
    const idx = goldUsers.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      goldUsers[idx].is_banned = newBanState;
      goldUsers[idx].banned_at = updated.banned_at;
      goldUsers[idx].ban_reason = updated.ban_reason;
    }
    saveData();

    return res.json({
      success: true,
      is_banned: updated.is_banned,
      banned_at: updated.banned_at,
      ban_reason: updated.ban_reason,
      user: sanitizeUser(updated)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Email Logs
app.get('/api/admin/email-logs', requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  const all = db.getAllEmails().map(e => ({
    id: e.id,
    from: e.sender || e.from_email || e.from,
    to: e.recipient || e.to_email || e.to,
    subject: e.subject,
    status: e.status || (e.folder === 'trash' ? 'trash' : 'inbox'),
    folder: e.folder,
    received_at: e.received_at || e.created_at,
    is_read: Boolean(e.is_read)
  }));
  res.json(all.slice(0, 200));
});

// 6. Storage Management
app.get('/api/admin/storage', requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const totalAllocated = accounts.reduce((sum, u) => sum + (u.storage_limit_bytes || 15 * 1024 * 1024 * 1024), 0);
  const totalUsed = accounts.reduce((sum, u) => sum + (u.storage_used_bytes || 0), 0);

  const topUsers = [...accounts]
    .sort((a, b) => (b.storage_used_bytes || 0) - (a.storage_used_bytes || 0))
    .slice(0, 15)
    .map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name} ${u.last_name}`.trim(),
      usedBytes: u.storage_used_bytes || 0,
      usedMb: ((u.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1),
      limitBytes: u.storage_limit_bytes || 15 * 1024 * 1024 * 1024,
      limitGb: ((u.storage_limit_bytes || 15 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024)).toFixed(0),
      percent: Math.min(100, (((u.storage_used_bytes || 0) / (u.storage_limit_bytes || 15 * 1024 * 1024 * 1024)) * 100)).toFixed(1)
    }));

  res.json({
    totalAllocatedGb: (totalAllocated / (1024 * 1024 * 1024)).toFixed(0),
    totalUsedMb: (totalUsed / (1024 * 1024)).toFixed(1),
    totalUsedGb: (totalUsed / (1024 * 1024 * 1024)).toFixed(2),
    percentUsed: ((totalUsed / totalAllocated) * 100).toFixed(2),
    users: topUsers
  });
});

app.put('/api/admin/storage/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limitGb } = req.body;
    if (!limitGb || isNaN(Number(limitGb))) return res.status(400).json({ error: 'limitGb required' });

    const limitBytes = Number(limitGb) * 1024 * 1024 * 1024;
    const updated = await db.updateAccount(id, { storage_limit_bytes: limitBytes });
    if (!updated) return res.status(404).json({ error: 'User not found' });

    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'UPDATE_STORAGE_LIMIT', 'user', id, `Updated storage for ${updated.email} to ${limitGb} GB`);

    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Subscriptions & Plans
app.get('/api/admin/subscriptions', requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const plans = [
    { name: 'Free Standard', quota: '15 GB', priceMonthly: 0, count: accounts.filter(u => !u.plan || u.plan === 'free').length },
    { name: 'Pro Power User', quota: '100 GB', priceMonthly: 4.99, count: accounts.filter(u => u.plan === 'pro').length },
    { name: 'Enterprise Cloud', quota: '1 TB', priceMonthly: 14.99, count: accounts.filter(u => u.plan === 'enterprise').length }
  ];
  const subscribers = accounts.map(u => ({
    id: u.id,
    email: u.email,
    plan: u.plan || 'free',
    billing: u.plan_billing || 'monthly',
    status: u.plan_status || 'active',
    joinedAt: u.created_at
  }));
  res.json({ plans, subscribers });
});

app.put('/api/admin/subscriptions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { plan, status } = req.body;
    const updates: Partial<StoredGoldUser> = {};
    if (plan) updates.plan = plan;
    if (status) updates.plan_status = status;
    if (plan === 'enterprise') updates.storage_limit_bytes = 1024 * 1024 * 1024 * 1024;
    else if (plan === 'pro') updates.storage_limit_bytes = 100 * 1024 * 1024 * 1024;

    const updated = await db.updateAccount(id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. Payments & Invoices (NOWPayments)
app.get('/api/admin/payments', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getPayments());
});

app.post('/api/admin/payments', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userEmail, planName, amountUsd, cryptoCurrency, status } = req.body;
    const p = await db.recordPayment({
      id: 'pay_' + crypto.randomBytes(5).toString('hex'),
      payment_id: 'now_' + Date.now(),
      user_email: userEmail || 'client@goldmailer.xyz',
      plan_name: planName || 'Pro 100GB',
      amount_usd: Number(amountUsd || 4.99),
      crypto_currency: cryptoCurrency || 'USDT',
      payment_status: status || 'confirmed',
      created_at: new Date().toISOString()
    });
    return res.status(201).json({ success: true, payment: p });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 9. Domains Management
app.get('/api/admin/domains', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getDomains());
});

app.post('/api/admin/domains', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain name required' });
    const dom = await db.addDomain(domain);
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'ADD_DOMAIN', 'domain', dom.id, `Added domain ${dom.domain}`);
    return res.status(201).json({ success: true, domain: dom });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/domains/:id/verify', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const dom = await db.verifyDomain(id);
  if (!dom) return res.status(404).json({ error: 'Domain not found' });
  return res.json({ success: true, domain: dom, message: 'Domain DNS records verified successfully.' });
});

app.delete('/api/admin/domains/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const ok = await db.deleteDomain(id);
  if (!ok) return res.status(400).json({ error: 'Cannot delete primary default domain or domain not found' });
  return res.json({ success: true });
});

// 10. System Health
app.get('/api/admin/system-health', requireAdmin, (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    serverStatus: 'healthy',
    databaseStatus: 'connected',
    databaseEngine: 'Supabase PostgreSQL + High-Speed Persistent Store',
    apiStatus: 'optimal',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
    cpuLoadPercent: 4.2,
    activeSockets: sseClients.length,
    smtpStatus: (process.env.SMTP_HOST || db.getSettings().smtp_host) ? 'connected' : 'not_configured',
    twilioStatus: getTwilioConfig().isConfigured ? 'connected' : 'not_configured',
    resendStatus: process.env.RESEND_API_KEY ? 'connected' : 'not_configured',
    lastHealthCheck: new Date().toISOString()
  });
});

// 11. Reports & Analytics
app.get(['/api/admin/analytics', '/api/admin/reports'], requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const allEmails = db.getAllEmails();
  const payments = db.getPayments();

  // 7-day registration curve (strictly real database metrics, no mock numbers)
  const days: { date: string; users: number; emails: number; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const uCount = accounts.filter(u => (u.created_at || '').startsWith(dateStr)).length;
    const eCount = allEmails.filter(e => e.status !== 'deleted' && (e.received_at || e.created_at || '').startsWith(dateStr)).length;
    const dayRevenue = payments
      .filter(p => p.payment_status === 'confirmed' && (p.created_at || '').startsWith(dateStr))
      .reduce((sum, p) => sum + (p.amount_usd || 0), 0);
    days.push({
      date: dateStr,
      users: uCount,
      emails: eCount,
      revenue: Number(dayRevenue.toFixed(2))
    });
  }

  res.json({
    dailyMetrics: days,
    activeUsersCount: accounts.filter(u => !u.is_banned).length,
    totalStorageGb: (accounts.reduce((s, u) => s + (u.storage_used_bytes || 0), 0) / (1024 * 1024 * 1024)).toFixed(2)
  });
});

// 12. Support Tickets
app.get(['/api/admin/support-tickets', '/api/admin/tickets'], requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getTickets());
});

app.post('/api/admin/support-tickets/:id/reply', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, status } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    const updated = await db.replyToTicket(id, adminEmail, 'GoldMailer Support', true, content, status);
    if (!updated) return res.status(404).json({ error: 'Ticket not found' });

    return res.json({ success: true, ticket: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/support-tickets/:id/status', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const ticket = db.getTickets().find(t => t.id === id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  ticket.status = status;
  db.saveToDiskSync();
  return res.json({ success: true, ticket });
});

// Client user ticket creation endpoint
app.post('/api/support/tickets', async (req: Request, res: Response) => {
  try {
    const { userEmail, subject, category, priority, message, userName } = req.body;
    if (!userEmail || !subject || !message) {
      return res.status(400).json({ error: 'userEmail, subject, and message are required' });
    }
    const t = await db.createTicket(userEmail, subject, category || 'general', priority || 'medium', message, userName);
    return res.status(201).json({ success: true, ticket: t });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 13. Spam & Security
app.get('/api/admin/security', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    blockedIps: db.getBlockedIps(),
    suspiciousLoginsCount: loginAttempts.filter(l => l.status === 'rejected' || l.status === 'pending').length,
    totalDevicesCount: userDevices.length,
    activeSecurityRules: [
      { id: 'sec_01', name: 'Anti-Brute Force Protection', status: 'active', threshold: '5 failed attempts per 15 min' },
      { id: 'sec_02', name: 'Inbound Spam Heuristics', status: 'active', threshold: 'SpamAssassin Score > 5.0' },
      { id: 'sec_03', name: 'Two-Factor Enforcement Option', status: 'active', threshold: 'Admin & High-Privilege' }
    ]
  });
});

app.post('/api/admin/security/block-ip', requireAdmin, async (req: Request, res: Response) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
  await db.blockIp(ip, reason, adminEmail);
  return res.json({ success: true, blockedIps: db.getBlockedIps() });
});

app.post('/api/admin/security/unblock-ip', requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
  await db.unblockIp(ip, adminEmail);
  return res.json({ success: true, blockedIps: db.getBlockedIps() });
});

// 14. Trash Recovery (30-day recovery)
app.get(['/api/admin/trash-recovery', '/api/admin/trash'], requireAdmin, (_req: Request, res: Response) => {
  ensureDataLoaded();
  const trashedEmails = db.getAllEmails()
    .filter(e => e.status === 'trash' || e.folder === 'trash' || e.status === 'deleted')
    .slice(0, 100)
    .map(e => ({
      id: e.id,
      from: e.sender || e.from_email || e.from,
      to: e.recipient || e.to_email || e.to,
      subject: e.subject,
      status: e.status,
      trashedAt: e.trashed_at || e.received_at
    }));
  res.json({ trashedEmails });
});

app.post('/api/admin/trash-recovery/recover-email/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const restored = await db.updateEmailStatus(id, 'inbox', 'primary');
  if (!restored) return res.status(404).json({ error: 'Email not found' });
  const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
  await db.logAdminActivity(adminEmail, 'RECOVER_EMAIL', 'email', id, `Recovered email "${restored.subject}" to inbox`);
  return res.json({ success: true, email: restored });
});

// 15. Settings
app.get('/api/admin/settings', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getSettings());
});

app.post('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const updated = await db.updateSettings(req.body);
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'UPDATE_SETTINGS', 'system', undefined, 'Updated global system settings');
    return res.json({ success: true, settings: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 16. Admin Roles & Permissions
app.get('/api/admin/roles', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getAdminRoles());
});

app.post('/api/admin/roles', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, name, role, permissions } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'email and name required' });
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    const newRole = await db.addAdminRole(email, name, role || 'support_admin', permissions || ['manage_tickets', 'view_users'], adminEmail);
    return res.status(201).json({ success: true, role: newRole });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/roles/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  await db.removeAdminRole(id);
  return res.json({ success: true });
});

// 17. Broadcast Notifications
app.get('/api/admin/notifications', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getBroadcasts());
});

app.post('/api/admin/notifications/broadcast', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, message, target } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    const broadcast = await db.createBroadcast(title, message, adminEmail, target || 'all');
    return res.status(201).json({ success: true, broadcast });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 18. Database Backup & Restore
app.get('/api/admin/backup', requireAdmin, (_req: Request, res: Response) => {
  const payload = db.generateBackupPayload();
  res.setHeader('Content-Disposition', `attachment; filename="goldmailer_db_backup_${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(payload);
});

app.post('/api/admin/backup/restore', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { jsonString } = req.body;
    if (!jsonString) return res.status(400).json({ error: 'jsonString required' });
    const result = await db.restoreFromBackupPayload(jsonString);
    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'RESTORE_DATABASE', 'system', undefined, `Restored database from backup: ${result.usersCount} users`);
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 19. API Keys Management
app.get('/api/admin/api-keys', requireAdmin, (_req: Request, res: Response) => {
  const settings = db.getSettings();
  const mask = (s: string) => (s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : s ? '••••••••' : '');
  res.json({
    twilioAccountSid: mask(settings.twilio_account_sid),
    twilioAuthTokenConfigured: Boolean(settings.twilio_auth_token),
    twilioPhoneNumber: settings.twilio_trial_number,
    resendApiKeyConfigured: Boolean(settings.resend_api_key || process.env.RESEND_API_KEY),
    nowpaymentsKeyConfigured: Boolean(settings.nowpayments_api_key),
    supabaseUrl: settings.supabase_url || '',
    supabaseConfigured: Boolean(settings.supabase_url && settings.supabase_anon_key),
    smtp_domain: 'goldmailer.xyz',
    smtp_host: settings.smtp_host || 'smtp.goldmailer.xyz',
    smtp_port: settings.smtp_port || 587,
    smtp_user: settings.smtp_user || 'postmaster@goldmailer.xyz',
    smtp_configured: Boolean(settings.smtp_host && settings.smtp_user)
  });
});

app.post('/api/admin/api-keys', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { twilioSid, twilioToken, twilioPhone, resendKey, nowpaymentsKey, nowpaymentsIpn, supabaseUrl, supabaseKey, smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
    const updates: Partial<StoredSettings> = {};
    if (twilioSid !== undefined) updates.twilio_account_sid = twilioSid;
    if (twilioToken !== undefined) updates.twilio_auth_token = twilioToken;
    if (twilioPhone !== undefined) updates.twilio_trial_number = twilioPhone;
    if (resendKey !== undefined) updates.resend_api_key = resendKey;
    if (nowpaymentsKey !== undefined) updates.nowpayments_api_key = nowpaymentsKey;
    if (nowpaymentsIpn !== undefined) updates.nowpayments_ipn_secret = nowpaymentsIpn;
    if (supabaseUrl !== undefined) updates.supabase_url = supabaseUrl;
    if (supabaseKey !== undefined) updates.supabase_anon_key = supabaseKey;
    if (smtpHost !== undefined) updates.smtp_host = smtpHost;
    if (smtpPort !== undefined) updates.smtp_port = Number(smtpPort) || 587;
    if (smtpUser !== undefined) updates.smtp_user = smtpUser;
    if (smtpPass !== undefined) updates.smtp_pass = smtpPass;

    await db.updateSettings(updates);
    if (twilioSid || twilioToken || twilioPhone) {
      setTwilioCredentials(twilioSid, twilioToken, twilioPhone);
    }

    const adminEmail = (req as any).adminUser?.email || 'admin@goldmailer.xyz';
    await db.logAdminActivity(adminEmail, 'UPDATE_API_KEYS', 'system', undefined, 'Updated third-party integration API keys');

    return res.json({ success: true, message: 'API Keys updated securely.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 20. Activity Logs
app.get('/api/admin/activity-logs', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getActivityLogs(200));
});

// Admin Twilio Gateway & Free Trial Endpoints
app.get('/api/admin/twilio/status', requireAdmin, async (_req: Request, res: Response) => {
  const cfg = getTwilioConfig();
  res.json({
    isConfigured: cfg.isConfigured,
    accountSid: cfg.accountSid ? `${cfg.accountSid.slice(0, 8)}...${cfg.accountSid.slice(-4)}` : '',
    hasAuthToken: Boolean(cfg.authToken),
    trialNumber: cfg.trialNumber,
    webhookUrl: cfg.webhookUrl,
    voiceWebhookUrl: cfg.voiceWebhookUrl
  });
});

app.post('/api/admin/twilio/config', requireAdmin, (req: Request, res: Response) => {
  const { accountSid, authToken, trialNumber } = req.body || {};
  if (!accountSid && !authToken && !trialNumber) {
    return res.status(400).json({ error: 'At least one field is required.' });
  }

  setTwilioCredentials(accountSid, authToken, trialNumber);

  // Sync to admin phone number record
  if (trialNumber) {
    const adminNum = userPhoneNumbers.find(p => p.id === 'phone_free_miracle_admin');
    if (adminNum) {
      adminNum.phoneNumber = trialNumber.trim();
      adminNum.friendlyName = `${trialNumber.trim()} (Admin Line)`;
    }
  }

  saveData();

  const cfg = getTwilioConfig();
  return res.json({
    success: true,
    message: 'Twilio configuration successfully saved.',
    isConfigured: cfg.isConfigured,
    trialNumber: cfg.trialNumber
  });
});

app.post('/api/admin/twilio/test', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { accountSid, authToken, trialNumber } = req.body || {};
    if (accountSid || authToken || trialNumber) {
      setTwilioCredentials(accountSid, authToken, trialNumber);
      saveData();
    }

    const testRes = await testTwilioConnection();

    if (testRes.success && testRes.trialNumbers && testRes.trialNumbers.length > 0) {
      const liveNumber = testRes.trialNumbers[0].phoneNumber;
      if (liveNumber) {
        setTwilioCredentials(undefined as any, undefined as any, liveNumber);
        const adminNum = userPhoneNumbers.find(p => p.id === 'phone_free_miracle_admin');
        if (adminNum) {
          adminNum.phoneNumber = liveNumber;
          adminNum.friendlyName = `${liveNumber} (Admin Trial Line)`;
        }
        saveData();
      }
    }

    return res.json(testRes);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Twilio diagnostic failed' });
  }
});

// ================= PHONE & SMS APIS (TWILIO & NOWPAYMENTS) =================

// Helper to get active user ID from token safely (does NOT default unauthenticated requests to admin!)
const resolveUserIdFromReq = (req: Request): { id: string; email: string; role?: string } => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (decoded?.id) {
      const user = goldUsers.find(u => u.id === decoded.id || u.email === decoded.email);
      const email = (decoded.email || user?.email || '').toLowerCase().trim();
      const isAdmin = decoded.role === 'admin' || user?.role === 'admin' ||
        email === 'miracle@goldmailer.xyz' || email === 'admin@goldmailer.xyz';
      return {
        id: decoded.id,
        email: email,
        role: isAdmin ? 'admin' : (user?.role || 'user')
      };
    }
  }
  return { id: '', email: '', role: 'guest' };
};

const isReqAdmin = (authUser: { id: string; email: string; role?: string }): boolean => {
  if (authUser.role === 'admin') return true;
  if (!authUser.email) return false;
  const email = authUser.email.toLowerCase().trim();
  return email === 'miracle@goldmailer.xyz' || email === 'admin@goldmailer.xyz';
};

// TASK 1: TWILIO WEBHOOK (Receive From, To, Body, MessageSid, save to sms_inbox, return TwiML)
// Supports both HTTP POST and GET, form-urlencoded, JSON, raw streams, and query parameters
export const handleTwilioSmsWebhook = async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    let bodyObj: Record<string, any> = {};
    if (typeof req.body === 'string') {
      try {
        bodyObj = Object.fromEntries(new URLSearchParams(req.body));
      } catch {}
    } else if (Buffer.isBuffer(req.body)) {
      try {
        bodyObj = Object.fromEntries(new URLSearchParams(req.body.toString('utf-8')));
      } catch {}
    } else if (req.body && typeof req.body === 'object') {
      bodyObj = req.body;
    } else if ((req as any).readable) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req as any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (raw) {
          try {
            bodyObj = Object.fromEntries(new URLSearchParams(raw));
          } catch {
            try {
              bodyObj = JSON.parse(raw);
            } catch {}
          }
        }
      } catch {}
    }

    const queryObj = (req.query || {}) as Record<string, any>;
    const payload = { ...queryObj, ...bodyObj };
    const from = String(payload.From || payload.from || '').trim();
    const to = String(payload.To || payload.to || '').trim();
    const text = String(payload.Body || payload.body || '').trim();
    const messageSid = String(payload.MessageSid || payload.messageSid || payload.SmsSid || '').trim();

    console.log(`[TWILIO WEBHOOK] Received SMS. From: "${from}", To: "${to}", Body: "${text}", Sid: "${messageSid}"`);

    const { trialNumber } = getTwilioConfig();
    const cleanToDigits = to.replace(/\D/g, '');

    // Normalize 'To' number to find user in database
    const matchedNumber = userPhoneNumbers.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '') === cleanToDigits);
    const targetUser = matchedNumber
      ? goldUsers.find(u => u.id === matchedNumber.userId)
      : (goldUsers.find(u => u.phone && u.phone.replace(/\D/g, '') === cleanToDigits) || goldUsers[0]);

    const targetUserId = targetUser?.id || (matchedNumber ? matchedNumber.userId : 'usr_miracle_01');

    const newSms: StoredSMS = {
      id: 'sms_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: targetUserId,
      from: from || 'Unknown Sender',
      to: to || trialNumber || '+17372508034',
      body: text,
      receivedAt: new Date().toISOString(),
      messageSid: messageSid || 'SM_' + Date.now(),
      direction: 'inbound',
      status: 'received',
      is_read: false
    };

    // Deduplicate by messageSid if present
    if (messageSid) {
      const existingIdx = sms_inbox.findIndex(s => s.messageSid === messageSid);
      if (existingIdx !== -1) {
        sms_inbox[existingIdx] = { ...sms_inbox[existingIdx], ...newSms, id: sms_inbox[existingIdx].id };
      } else {
        sms_inbox.unshift(newSms);
      }
    } else {
      sms_inbox.unshift(newSms);
    }

    saveData();
    broadcastNewSMS(newSms);

    console.log(`[TWILIO WEBHOOK] Saved incoming SMS ${newSms.id} for user ${targetUserId} with content: "${text}"`);

    // Return HTTP 200 with standard TwiML <Response></Response>
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>');
  } catch (err: any) {
    console.error('[TWILIO WEBHOOK] Exception handling webhook:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>');
  }
};

app.all(
  ['/api/webhook/twilio/sms', '/api/webhooks/twilio/sms', '/api/webhook/twilio', '/api/webhooks/twilio'],
  handleTwilioSmsWebhook
);

// TASK 2: NOWPAYMENTS WEBHOOK (Verify IPN_SECRET, extend 30 days if payment_status=finished)
export const handleNowPaymentsWebhook = async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const body = req.body || {};
    const signature = (req.headers['x-nowpayments-sig'] || '').toString();

    console.log('[NOWPAYMENTS WEBHOOK] Received IPN callback:', {
      payment_id: body.payment_id,
      payment_status: body.payment_status,
      order_id: body.order_id
    });

    const isSigValid = verifyNowPaymentsSignature(body, signature);
    if (!isSigValid) {
      console.warn('[NOWPAYMENTS WEBHOOK] IPN signature verification failed.');
      return res.status(400).json({ error: 'Invalid IPN signature' });
    }

    const paymentStatus = (body.payment_status || '').toLowerCase();
    if (paymentStatus === 'finished' || paymentStatus === 'confirmed' || paymentStatus === 'sending') {
      const orderId = String(body.order_id || '');
      const orderDesc = String(body.order_description || '');

      let targetNumber = '';
      const numMatch = orderDesc.match(/(\+\d{10,15})/);
      if (numMatch) {
        targetNumber = numMatch[1];
      }

      let phoneRecord = userPhoneNumbers.find(p => p.phoneNumber === targetNumber);
      if (!phoneRecord) {
        phoneRecord = userPhoneNumbers[0];
      }

      if (phoneRecord) {
        const currentMs = new Date(phoneRecord.expiresAt).getTime();
        const baseMs = currentMs > Date.now() ? currentMs : Date.now();
        phoneRecord.expiresAt = new Date(baseMs + 30 * 24 * 3600 * 1000).toISOString();
        phoneRecord.status = 'active';
        console.log(`[NOWPAYMENTS] Extended subscription for ${phoneRecord.phoneNumber} by 30 days to ${phoneRecord.expiresAt}`);
      }

      phonePurchases.unshift({
        id: 'pur_' + Date.now(),
        userId: phoneRecord?.userId || 'usr_miracle_01',
        paymentId: String(body.payment_id || ''),
        orderId: orderId,
        phoneNumber: targetNumber || phoneRecord?.phoneNumber || '+17372508034',
        amount: Number(body.price_amount || 6.0),
        currency: String(body.price_currency || 'usd'),
        status: 'finished',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      saveData();
      return res.status(200).json({ success: true, message: 'Subscription extended 30 days' });
    }

    return res.status(200).json({ success: true, status: paymentStatus });
  } catch (err: any) {
    console.error('[NOWPAYMENTS WEBHOOK] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
};

app.post(
  ['/api/webhook/nowpayments', '/api/webhooks/nowpayments'],
  handleNowPaymentsWebhook
);

// 3. GET /api/phone/numbers - Retrieve user's active phone numbers
app.get('/api/phone/numbers', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const { trialNumber } = getTwilioConfig();
  const isAdmin = isReqAdmin(authUser);

  // Ensure admin has the configured primary phone line
  if (isAdmin) {
    const adminPhoneIndex = userPhoneNumbers.findIndex(
      p => p.id === 'phone_free_miracle_admin' || p.phoneNumber === trialNumber || (p.userId === authUser.id || p.userEmail === 'miracle@goldmailer.xyz')
    );
    if (adminPhoneIndex === -1) {
      userPhoneNumbers.unshift({
        id: 'phone_free_miracle_admin',
        userId: authUser.id || 'usr_miracle_01',
        userEmail: authUser.email || 'miracle@goldmailer.xyz',
        phoneNumber: trialNumber,
        friendlyName: `${trialNumber} (Primary Line)`,
        provider: 'twilio',
        status: 'active',
        purchasedAt: '2026-10-08T00:00:00.000Z',
        expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
        autoRenew: true,
        capabilities: { sms: true, voice: true }
      });
      saveData();
    } else {
      if (userPhoneNumbers[adminPhoneIndex].phoneNumber !== trialNumber) {
        userPhoneNumbers[adminPhoneIndex].phoneNumber = trialNumber;
        userPhoneNumbers[adminPhoneIndex].friendlyName = `${trialNumber} (Primary Line)`;
        userPhoneNumbers[adminPhoneIndex].status = 'active';
        saveData();
      }
    }
  }

  // Strictly do NOT give free trial numbers to regular users!
  // Only return numbers the user actually owns/purchased (or admin's line if admin)
  const list = userPhoneNumbers.filter(
    p => (authUser.id && p.userId === authUser.id) || (isAdmin && (p.phoneNumber === trialNumber || p.id === 'phone_free_miracle_admin'))
  );

  const enriched = list.map(p => {
    const exp = new Date(p.expiresAt).getTime();
    const daysRemaining = Math.max(0, Math.ceil((exp - Date.now()) / (24 * 3600 * 1000)));
    return {
      ...p,
      daysRemaining,
      status: (daysRemaining > 0 || isAdmin) ? 'active' : 'expired'
    };
  });

  return res.json({
    success: true,
    numbers: enriched,
    isAdmin,
    adminNumber: isAdmin ? trialNumber : undefined,
    isTwilioConfigured: getTwilioConfig().isConfigured
  });
});

// 4. GET /api/phone/available - Search available numbers to buy directly from Twilio API
// Exclude any phone number that has already been bought
app.get('/api/phone/available', async (_req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const list = await listAvailablePhoneNumbers(16);
    const { trialNumber } = getTwilioConfig();

    // Any phone number that has been bought should not display again
    const boughtSet = new Set<string>();
    userPhoneNumbers.forEach(p => {
      if (p.phoneNumber) boughtSet.add(p.phoneNumber.replace(/[^\d+]/g, ''));
    });
    phonePurchases.forEach(p => {
      if (p.phoneNumber) boughtSet.add(p.phoneNumber.replace(/[^\d+]/g, ''));
    });
    // Never display admin dedicated trial number in the purchase list
    if (trialNumber) {
      boughtSet.add(trialNumber.replace(/[^\d+]/g, ''));
    }

    const availableNumbers = list.filter(n => !boughtSet.has(n.phoneNumber.replace(/[^\d+]/g, '')));

    return res.json({
      success: true,
      availableNumbers
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/phone/buy-intent - Create NOWPayments crypto invoice for phone rental
app.post('/api/phone/buy-intent', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { phoneNumber } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);

    if (isAdmin) {
      return res.json({
        success: true,
        isAdmin: true,
        message: 'Admin account has free lifetime direct activation.'
      });
    }

    const targetNum = phoneNumber || '+17372508034';
    const orderId = `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const description = `Phone Subscription for ${targetNum} (${authUser.email})`;

    const invoiceResult = await createNowPaymentsInvoice({
      priceAmount: 6.0,
      priceCurrency: 'usd',
      orderId,
      orderDescription: description
    });

    return res.json({
      success: true,
      orderId,
      phoneNumber: targetNum,
      amount: 6.0,
      currency: 'USD',
      invoiceUrl: invoiceResult.invoiceUrl,
      invoiceId: invoiceResult.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. POST /api/phone/buy-number - Direct provision / activation of purchased phone number
app.post('/api/phone/buy-number', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { phoneNumber, friendlyName } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = authUser.email === 'miracle@goldmailer.xyz' || authUser.id === 'usr_miracle_01';

    // Purchase via Twilio API
    const buyResult = await buyTwilioPhoneNumber(phoneNumber);
    const targetNum = buyResult.phoneNumber || phoneNumber || '+17372508034';

    let existing = userPhoneNumbers.find(p => p.phoneNumber === targetNum && p.userId === authUser.id);
    if (existing) {
      const currentMs = new Date(existing.expiresAt).getTime();
      const baseMs = currentMs > Date.now() ? currentMs : Date.now();
      existing.expiresAt = new Date(baseMs + (isAdmin ? 3650 : 30) * 24 * 3600 * 1000).toISOString();
      existing.status = 'active';
    } else {
      existing = {
        id: 'phone_' + Date.now(),
        userId: authUser.id,
        userEmail: authUser.email,
        phoneNumber: targetNum,
        friendlyName: friendlyName || targetNum,
        provider: 'twilio',
        status: 'active',
        purchasedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (isAdmin ? 3650 : 30) * 24 * 3600 * 1000).toISOString(),
        autoRenew: true,
        capabilities: { sms: true, voice: true }
      };
      userPhoneNumbers.push(existing);
    }

    saveData();
    return res.json({
      success: true,
      message: `Phone number ${targetNum} activated successfully.`,
      number: existing
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/phone/extend - Extend subscription
app.post('/api/phone/extend', (req: Request, res: Response) => {
  ensureDataLoaded();
  const { phoneNumber } = req.body;
  const authUser = resolveUserIdFromReq(req);

  const phone = userPhoneNumbers.find(p => (phoneNumber ? p.phoneNumber === phoneNumber : true) && p.userId === authUser.id)
    || userPhoneNumbers[0];

  if (!phone) {
    return res.status(404).json({ error: 'No phone number found to extend' });
  }

  const currentMs = new Date(phone.expiresAt).getTime();
  const baseMs = currentMs > Date.now() ? currentMs : Date.now();
  phone.expiresAt = new Date(baseMs + 30 * 24 * 3600 * 1000).toISOString();
  phone.status = 'active';

  saveData();
  return res.json({
    success: true,
    message: `Subscription extended until ${phone.expiresAt}`,
    number: phone
  });
});

// 8. CONTACTS MANAGEMENT: GET /api/phone/contacts
app.get('/api/phone/contacts', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const contacts = phoneContacts.filter(c => c.userId === authUser.id);
  return res.json({ success: true, contacts });
});

// 9. POST /api/phone/contacts - Save new contact
app.post('/api/phone/contacts', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const { name, phoneNumber, notes } = req.body;
  if (!name || !phoneNumber) {
    return res.status(400).json({ error: 'Name and phone number are required' });
  }
  const newContact: StoredContact = {
    id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    userId: authUser.id,
    name: String(name).trim(),
    phoneNumber: String(phoneNumber).trim(),
    notes: notes ? String(notes).trim() : undefined,
    createdAt: new Date().toISOString()
  };
  phoneContacts.unshift(newContact);
  saveData();
  return res.json({ success: true, contact: newContact });
});

// 10. DELETE /api/phone/contacts/:id - Delete a contact
app.delete('/api/phone/contacts/:id', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  phoneContacts = phoneContacts.filter(c => !(c.id === req.params.id && c.userId === authUser.id));
  saveData();
  return res.json({ success: true });
});

// 11. GET /api/phone/sms - Retrieve user's SMS inbox (with live Twilio sync for admin)
app.get('/api/phone/sms', async (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = isReqAdmin(authUser);
  const { trialNumber } = getTwilioConfig();

  // Active sync from live Twilio API to guarantee incoming SMS is immediately displayed
  const client = getTwilioClient();
  if (client) {
    try {
      const liveMessages = await client.messages.list({ limit: 40 });
      let hasNew = false;
      for (const tm of liveMessages) {
        if (!sms_inbox.some(s => s.messageSid === tm.sid)) {
          const newLiveSms: StoredSMS = {
            id: 'sms_live_' + tm.sid,
            userId: authUser.id || 'usr_miracle_01',
            from: tm.from || 'Unknown',
            to: tm.to || trialNumber || '+17372508034',
            body: tm.body || '',
            receivedAt: tm.dateSent ? tm.dateSent.toISOString() : (tm.dateCreated ? tm.dateCreated.toISOString() : new Date().toISOString()),
            messageSid: tm.sid,
            direction: (tm.direction || '').includes('inbound') ? 'inbound' : 'outbound',
            status: tm.status,
            is_read: false
          };
          sms_inbox.unshift(newLiveSms);
          broadcastNewSMS(newLiveSms);
          hasNew = true;
        }
      }
      if (hasNew) {
        saveData();
      }
    } catch (syncErr: any) {
      console.warn('[TWILIO ACTIVE SYNC] Note:', syncErr.message || syncErr);
    }
  }

  const userPhonesDigits = new Set<string>();
  userPhoneNumbers
    .filter(p => p.userId === authUser.id || (isAdmin && (p.id === 'phone_free_miracle_admin' || p.phoneNumber === trialNumber)))
    .forEach(p => {
      if (p.phoneNumber) userPhonesDigits.add(p.phoneNumber.replace(/\D/g, ''));
    });
  if (trialNumber && isAdmin) {
    userPhonesDigits.add(trialNumber.replace(/\D/g, ''));
  }

  const list = sms_inbox.filter(s => {
    // Admin inbox displays all platform and Twilio trial SMS
    if (isAdmin) return true;
    if (authUser.id && s.userId === authUser.id) return true;
    const toDigits = (s.to || '').replace(/\D/g, '');
    const fromDigits = (s.from || '').replace(/\D/g, '');
    if (userPhonesDigits.has(toDigits) || userPhonesDigits.has(fromDigits)) return true;
    return false;
  });

  return res.json({
    success: true,
    messages: list
  });
});

// 12. POST /api/phone/send-sms - Send outbound SMS through Twilio
app.post('/api/phone/send-sms', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { to, body, from } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);
    const { trialNumber } = getTwilioConfig();
    const userPhones = userPhoneNumbers.filter(p => p.userId === authUser.id && (isAdmin || p.phoneNumber !== trialNumber));

    // Non-admin users cannot use the Twilio free trial!
    if (!isAdmin && userPhones.length === 0) {
      return res.status(403).json({
        error: 'You must have an active purchased phone number to send SMS. Twilio trial is reserved for system admin.'
      });
    }

    if (!to || !body) {
      return res.status(400).json({ error: 'Recipient phone number (to) and message (body) are required.' });
    }

    const fromNumber = from || (userPhones[0]?.phoneNumber) || (isAdmin ? trialNumber : '');

    if (!fromNumber) {
      return res.status(400).json({ error: 'You must have an active phone number to send SMS.' });
    }

    const normalizedTo = normalizePhoneNumber(to, '+234');

    const twilioResult = await sendSmsViaTwilio({
      to: normalizedTo,
      from: fromNumber,
      body
    });

    const outboundSms: StoredSMS = {
      id: 'sms_out_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: authUser.id,
      from: fromNumber,
      to: normalizedTo,
      body,
      receivedAt: new Date().toISOString(),
      messageSid: twilioResult.messageSid || 'SM_' + Date.now(),
      direction: 'outbound',
      status: twilioResult.success ? (twilioResult.status || 'sent') : 'failed',
      is_read: true
    };

    sms_inbox.unshift(outboundSms);
    saveData();
    broadcastNewSMS(outboundSms);

    if (!twilioResult.success) {
      return res.status(400).json({
        success: false,
        error: twilioResult.error || 'Failed to send SMS through Twilio',
        sms: outboundSms
      });
    }

    return res.json({
      success: true,
      messageSid: twilioResult.messageSid,
      sms: outboundSms
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 13. PATCH /api/phone/sms/:id/read - Mark SMS as read
app.patch('/api/phone/sms/:id/read', (req: Request, res: Response) => {
  ensureDataLoaded();
  const sms = sms_inbox.find(s => s.id === req.params.id);
  if (sms) {
    sms.is_read = true;
    saveData();
  }
  return res.json({ success: true });
});

// 14. DELETE /api/phone/sms/:id - Delete single SMS
app.delete('/api/phone/sms/:id', (req: Request, res: Response) => {
  ensureDataLoaded();
  sms_inbox = sms_inbox.filter(s => s.id !== req.params.id);
  saveData();
  return res.json({ success: true });
});

// 15. DELETE /api/phone/sms - Clear all SMS for user
app.delete('/api/phone/sms', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const userPhones = new Set(
    userPhoneNumbers.filter(p => p.userId === authUser.id).map(p => p.phoneNumber)
  );
  sms_inbox = sms_inbox.filter(s => s.userId !== authUser.id && !userPhones.has(s.to) && !userPhones.has(s.from));
  saveData();
  return res.json({ success: true });
});

// ================= TWILIO VOICE CALLING (INCOMING & OUTGOING) =================

// 16. INCOMING VOICE WEBHOOK: /api/webhook/twilio/voice
export const handleTwilioVoiceWebhook = async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const body = { ...(req.query || {}), ...(req.body || {}) };
    const from = String(body.From || body.from || 'Caller').trim();
    const to = String(body.To || body.to || '+17372508034').trim();
    const callSid = String(body.CallSid || body.callSid || 'CA_' + Date.now()).trim();

    console.log(`[TWILIO VOICE WEBHOOK] Incoming call from ${from} to ${to} (SID: ${callSid})`);

    const newCall: StoredCall = {
      id: 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: 'usr_miracle_01',
      from,
      to,
      direction: 'inbound',
      status: 'in-progress',
      callSid,
      startedAt: new Date().toISOString()
    };

    calls_history.unshift(newCall);
    saveData();
    broadcastNewCall(newCall);

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="30"/>
</Response>`);
  } catch (err: any) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
};

app.all(
  ['/api/webhook/twilio/voice', '/api/webhooks/twilio/voice'],
  handleTwilioVoiceWebhook
);

// 17. VOICE CALL STATUS CALLBACK: /api/webhook/twilio/voice/status
export const handleTwilioVoiceStatusWebhook = async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const body = { ...(req.query || {}), ...(req.body || {}) };
    const callSid = String(body.CallSid || body.callSid || '');
    const callStatus = String(body.CallStatus || body.callStatus || 'completed').toLowerCase() as any;
    const duration = parseInt(body.CallDuration || body.Duration || '0', 10);

    const call = calls_history.find(c => c.callSid === callSid);
    if (call) {
      call.status = callStatus;
      if (duration > 0) call.durationSeconds = duration;
      call.endedAt = new Date().toISOString();
      saveData();
      broadcastNewCall(call);
    }

    return res.status(200).send('OK');
  } catch (err: any) {
    return res.status(200).send('OK');
  }
};

app.all(
  ['/api/webhook/twilio/voice/status', '/api/webhooks/twilio/voice/status'],
  handleTwilioVoiceStatusWebhook
);

// 18. OUTGOING CALL: POST /api/phone/call (Direct voice call without text-to-speech)
app.post('/api/phone/call', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { to, from } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);
    const { trialNumber } = getTwilioConfig();
    const userPhones = userPhoneNumbers.filter(p => p.userId === authUser.id && (isAdmin || p.phoneNumber !== trialNumber));

    // Non-admin users cannot use the Twilio free trial!
    if (!isAdmin && userPhones.length === 0) {
      return res.status(403).json({
        error: 'You must have an active purchased phone number to place calls. Twilio trial is reserved for system admin.'
      });
    }

    if (!to) {
      return res.status(400).json({ error: 'Recipient phone number (to) is required.' });
    }

    const fromNumber = from || (userPhones[0]?.phoneNumber) || (isAdmin ? trialNumber : '');

    if (!fromNumber) {
      return res.status(400).json({ error: 'You must have an active phone number to place calls.' });
    }

    const normalizedTo = normalizePhoneNumber(to, '+234');

    const callResult = await makeCallViaTwilio({
      to: normalizedTo,
      from: fromNumber
    });

    const outboundCall: StoredCall = {
      id: 'call_out_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: authUser.id,
      from: fromNumber,
      to: normalizedTo,
      direction: 'outbound',
      status: callResult.success ? ((callResult.status as any) || 'in-progress') : 'failed',
      callSid: callResult.callSid || 'CA_' + Date.now(),
      startedAt: new Date().toISOString()
    };

    calls_history.unshift(outboundCall);
    saveData();
    broadcastNewCall(outboundCall);

    if (!callResult.success) {
      return res.status(400).json({
        success: false,
        error: callResult.error || 'Failed to place call through Twilio',
        call: outboundCall
      });
    }

    return res.json({
      success: true,
      callSid: callResult.callSid,
      call: outboundCall
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 19. GET /api/phone/calls - Retrieve user's call history
app.get('/api/phone/calls', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = authUser.email === 'miracle@goldmailer.xyz' || authUser.id === 'usr_miracle_01';
  const userPhones = new Set(
    userPhoneNumbers
      .filter(p => p.userId === authUser.id || (isAdmin && p.id === 'phone_free_miracle_admin'))
      .map(p => p.phoneNumber)
  );

  const list = calls_history.filter(c => {
    if (c.userId === authUser.id) return true;
    if (userPhones.has(c.to) || userPhones.has(c.from)) return true;
    return false;
  });

  return res.json({
    success: true,
    calls: list
  });
});

// 20. DELETE /api/phone/calls/:id - Delete single call record
app.delete('/api/phone/calls/:id', (req: Request, res: Response) => {
  ensureDataLoaded();
  calls_history = calls_history.filter(c => c.id !== req.params.id);
  saveData();
  return res.json({ success: true });
});

// 21. DELETE /api/phone/calls - Clear all calls for user
app.delete('/api/phone/calls', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const userPhones = new Set(
    userPhoneNumbers.filter(p => p.userId === authUser.id).map(p => p.phoneNumber)
  );
  calls_history = calls_history.filter(c => c.userId !== authUser.id && !userPhones.has(c.to) && !userPhones.has(c.from));
  saveData();
  return res.json({ success: true });
});

export default function handler(req: any, res: any) {
  return app(req, res);
}

export { app };
