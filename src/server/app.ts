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
  setTwilioCredentials,
  testTwilioConnection,
  normalizePhoneNumber
} from './phoneService.js';

// Server-Sent Events (SSE) for Real-Time email, SMS & Calls receiving
const sseClients: Response[] = [];
export function broadcastNewEmail(email: StoredEmail) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: 'new_email', email })}\n\n`);
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

// SMTP Transporter initialization (for password reset and outbound emails)
const smtpHost = process.env.SMTP_HOST || '';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

let smtpTransporter: any = null;
if (smtpHost && smtpUser) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  } catch (smtpErr) {
    console.warn('⚠️ SMTP Transporter init error:', smtpErr);
  }
}

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
  storage_used_bytes: number;
  storage_limit_bytes: number;
  avatar_url?: string;
  imap_config?: any;
  reset_token?: string;
  reset_token_expires?: number;
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
        goldUsers,
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

    try {
      const raw = fs.readFileSync(freshestFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.deletedEmailIds)) {
        for (const did of parsed.deletedEmailIds) {
          deletedEmailIds.add(did);
        }
      }
      if (Array.isArray(parsed.goldUsers)) {
        for (const u of parsed.goldUsers) {
          const idx = goldUsers.findIndex(gu => gu.id === u.id || (gu.email && u.email && gu.email.toLowerCase() === u.email.toLowerCase()));
          if (idx === -1) {
            goldUsers.push(u);
          } else {
            goldUsers[idx] = { ...goldUsers[idx], ...u };
          }
        }
      }
      if (Array.isArray(parsed.goldEmails)) {
        for (const em of parsed.goldEmails) {
          if (deletedEmailIds.has(em.id)) continue;
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
        // Purge any deleted emails from memory
        if (deletedEmailIds.size > 0) {
          goldEmails = goldEmails.filter(ge => !deletedEmailIds.has(ge.id));
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
    existingMiracle.password_hash = defaultPasswordHash;
    existingMiracle.is_banned = false;
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
      storage_used_bytes: 420 * 1024 * 1024,
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
    existingDoris.password_hash = defaultPasswordHash;
    existingDoris.is_banned = false;
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
      role: 'admin',
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      is_banned: false,
      storage_used_bytes: 280 * 1024 * 1024,
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
        category: 'primary'
      });
    }
  }

  // Ensure default OAuth demo app exists
  if (oauthClients.length === 0) {
    oauthClients.push({
      client_id: 'client_goldmailer_demo_app',
      client_secret: 'sec_' + crypto.randomBytes(16).toString('hex'),
      app_name: 'DevPortal Showcase',
      redirect_uri: 'https://goldmailer.xyz/oauth/callback',
      website_url: 'https://goldmailer.xyz',
      owner_user_id: 'usr_miracle_01',
      created_at: new Date().toISOString()
    });
  }

  // Ensure admin phone number (+17372508034) is exclusively assigned to admin (miracle@goldmailer.xyz)
  const defaultTrialNumber = process.env.TWILIO_PHONE_NUMBER || '+17372508034';
  const adminPhone = userPhoneNumbers.find(p => p.phoneNumber === defaultTrialNumber && (p.userId === 'usr_miracle_01' || p.userEmail === 'miracle@goldmailer.xyz'));
  if (!adminPhone) {
    userPhoneNumbers.unshift({
      id: 'phone_free_miracle_admin',
      userId: 'usr_miracle_01',
      userEmail: 'miracle@goldmailer.xyz',
      phoneNumber: defaultTrialNumber,
      friendlyName: '+1 (737) 250-8034 (Admin Line)',
      provider: 'twilio',
      status: 'active',
      purchasedAt: '2026-10-08T00:00:00.000Z',
      expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
      autoRenew: true,
      capabilities: { sms: true, voice: true }
    });
  } else {
    adminPhone.friendlyName = '+1 (737) 250-8034 (Admin Line)';
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
  const asGoldCom = `${usernamePart}@goldmailer.com`;
  const asGoldXyzNoDots = `${usernameNoDots}@goldmailer.xyz`;

  return {
    clean,
    usernamePart,
    usernameNoDots,
    cleanNoDots,
    asGoldXyz,
    asGoldCom,
    asGoldXyzNoDots
  };
}

export function matchesUserIdentifier(user: StoredGoldUser, rawInput: string): boolean {
  if (!user || !rawInput) return false;
  const { clean, usernamePart, usernameNoDots, cleanNoDots, asGoldXyz, asGoldCom, asGoldXyzNoDots } =
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
    uEmail === asGoldCom ||
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
        const exists = goldUsers.some(u => u.email.toLowerCase() === cleanEmail);
        if (!exists) {
          goldUsers.push({
            id: acc.id || ('usr_' + crypto.randomBytes(8).toString('hex')),
            email: acc.email,
            username: acc.username || acc.email.split('@')[0],
            password_hash: bcrypt.hashSync('@654413Mm', 10),
            first_name: acc.name?.split(' ')[0] || acc.username,
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
          });
          added++;
        }
      }
      if (added > 0) saveData();
    }
    return res.json({ success: true, total_users: goldUsers.length });
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

    const cleanEmail = asGoldXyz;

    if (goldUsers.some(u => (u.username || '').toLowerCase() === usernamePart || (u.email || '').toLowerCase() === cleanEmail)) {
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
      role: usernamePart.includes('admin') ? 'admin' : 'user',
      created_at: new Date().toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024, // 15 GB
      avatar_url: ''
    };

    goldUsers.unshift(newUser);

    // Welcome email in user's inbox
    goldEmails.unshift({
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
          <p>Your permanent email address <strong>${cleanEmail}</strong> has been secured.</p>
          <div style="background: rgba(255, 106, 0, 0.08); padding: 14px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Quota:</strong> 15 GB High-Speed Permanent Storage</p>
            <p style="margin: 4px 0 0;"><strong>Password Protected:</strong> This username is locked forever</p>
          </div>
          <p>You can also sign in to multiple GoldMailer accounts and switch between them anytime.</p>
          <p>Cheers,<br>The GoldMailer Team</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer, ${firstName}!\nYour permanent email ${cleanEmail} is ready with 15GB storage.\n\nGoldMailer Team`,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false,
      is_starred: true,
      folder: 'primary',
      category: 'primary'
    });

    saveData();

    const token = generateToken({ id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role });
    return res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(newUser),
      backup_codes: backupCodes
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. User Login (Supports any registered user, robust case-insensitive lookup & 2FA enforcement)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username, password, totp_code, backup_code, code, client_accounts } = req.body;
    const rawInput = (identifier || email || username || '').trim();
    if (!rawInput || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    let user = goldUsers.find(u => matchesUserIdentifier(u, rawInput));

    // Fallback: Check if client has this account in localStorage cache and rehydrate if server restarted
    if (!user && Array.isArray(client_accounts)) {
      const clientAcc = client_accounts.find((acc: any) => {
        const idToCheck = acc.email || acc.username || '';
        return matchesUserIdentifier({ email: acc.email, username: acc.username, backup_email: '' } as any, rawInput);
      });

      if (clientAcc) {
        const pwdHash = bcrypt.hashSync(String(password).trim(), 10);
        user = {
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
        goldUsers.unshift(user);
        saveData();
      }
    }

    if (!user) {
      return res.status(404).json({
        error: 'No GoldMailer account found with that email or username. Please check your credentials or click "Create Account".'
      });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended by administrators.' });
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

    // 2FA Verification Enforcement
    if (user.two_factor_enabled) {
      const codeProvided = (totp_code || backup_code || code || '').toString().trim();
      if (!codeProvided) {
        // Issue temporary token for 2FA verification step
        const tempAuthToken = generateToken({
          id: user.id,
          email: user.email,
          username: user.username,
          stage: '2fa_pending'
        });
        return res.json({
          requires_2fa: true,
          temp_auth_token: tempAuthToken,
          email: user.email,
          username: user.username,
          message: '2-Step Verification required. Please enter Authenticator code or backup code.'
        });
      }

      // Verify provided code
      let valid2FA = false;
      const cleanCode = codeProvided.replace(/[\s\-]/g, '');

      // Check TOTP code
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
          if (delta !== null) {
            valid2FA = true;
          }
        } catch (totpErr) {
          console.warn('TOTP validation note:', totpErr);
        }
      }

      // Check emergency backup codes (8 digits)
      if (!valid2FA && Array.isArray(user.backup_codes)) {
        const matchIdx = user.backup_codes.findIndex(
          bc => bc.replace(/[\s\-]/g, '').trim() === cleanCode
        );
        if (matchIdx !== -1) {
          valid2FA = true;
          user.backup_codes.splice(matchIdx, 1);
          saveData();
        }
      }

      if (!valid2FA) {
        return res.status(401).json({
          error: 'Invalid 2FA code or backup code. Please check and try again.'
        });
      }
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

    // A. Send via SMTP if transporter configured
    if (smtpTransporter) {
      try {
        await smtpTransporter.sendMail({
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
    const user = goldUsers.find(u => {
      if (u.reset_token && u.reset_token === cleanToken) {
        if (!email) return true;
        return u.email.toLowerCase().trim() === String(email).toLowerCase().trim();
      }
      return false;
    });

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
app.get('/api/emails/:emailAddress', async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const rawTarget = req.params.emailAddress || '';
    const cleanTarget = rawTarget.toLowerCase().trim();
    const folder = ((req.query.folder as string) || 'all').toLowerCase().trim();

    const matches = goldEmails.filter(e => {
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

      // Starred folder
      if (folder === 'starred') {
        return (isToMe || isFromMe) && e.is_starred && e.folder !== 'trash';
      }

      // Sent / Outbox / Scheduled folder
      if (folder === 'sent' || folder === 'outbox' || folder === 'scheduled') {
        return isFromMe && (e.folder === folder || e.folder === 'sent');
      }

      // Trash folder
      if (folder === 'trash') {
        return (isToMe || isFromMe) && e.folder === 'trash';
      }

      // Spam folder
      if (folder === 'spam') {
        return isToMe && e.folder === 'spam';
      }

      // All Mail / All Inboxes / All: Return all emails for this account (including sent, trash, and spam)
      // so the client maintains complete local state and emails never flicker or vanish when switching views!
      if (folder === 'all_mail' || folder === 'all' || folder === 'all_inboxes') {
        return isToMe || isFromMe;
      }

      // Primary / Inbox folder
      if (folder === 'primary' || folder === 'inbox') {
        return isToMe && (e.folder === 'primary' || !e.folder || e.folder === 'inbox') && e.folder !== 'trash' && e.folder !== 'spam';
      }

      // Specific category or folder
      if (isToMe && e.folder !== 'trash' && e.folder !== 'spam' && e.folder !== 'sent') {
        return e.folder === folder || e.category === folder;
      }

      return false;
    });

    matches.sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime());
    console.log(`[EMAILS] Retrieved ${matches.length} emails for target "${cleanTarget}" (folder="${folder}")`);
    return res.json(matches);
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
        if (deletedEmailIds.has(im.id) || (im.messageId && deletedEmailIds.has(im.messageId))) continue;
        const already = goldEmails.some(e => e.id === im.id || (im.messageId && e.raw?.messageId === im.messageId));
        if (!already) {
          goldEmails.unshift(im);
          newItemsCount++;
          broadcastNewEmail(im);
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
              if (deletedEmailIds.has(String(item.id)) || deletedEmailIds.has(`msg_${item.id}`)) continue;
              const already = goldEmails.some(e => e.id === String(item.id) || e.id === `msg_${item.id}`);
              if (!already) {
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
                  category: 'primary'
                };
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

    // CRITICAL: Sender must be the authenticated user's primary GoldMailer address (e.g. user@goldmailer.xyz)
    const userMainEmail = (authUser?.email || sender || '').toLowerCase().trim();
    if (!userMainEmail) {
      return res.status(400).json({ error: 'Sender email address is required' });
    }
    const senderDisplayName = authUser?.first_name
      ? `${authUser.first_name} ${authUser.last_name || ''}`.trim()
      : userMainEmail.split('@')[0];
    const fromHeader = `${senderDisplayName} <${userMainEmail}>`;

    const cleanToAddresses = getAllEmailAddresses(to);
    const toFormatted = cleanToAddresses.join(', ') || String(to).trim();
    const isScheduled = Boolean(scheduled_for && new Date(scheduled_for).getTime() > Date.now());

    let liveSent = false;
    let liveError: string | null = null;

    if (!isScheduled && resendApiKey) {
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
      scheduled_for: isScheduled ? scheduled_for : undefined
    };

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
          category: 'primary'
        };
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
app.post('/api/emails/simulate-inbound', (req: Request, res: Response) => {
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
      category: 'primary'
    };

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
app.patch('/api/emails/:id', (req: Request, res: Response) => {
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
    if (folder === 'primary' || folder !== 'trash') {
      deletedEmailIds.delete(id);
      if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);
    }
  }

  saveData();
  return res.json({ success: true, email });
});

// 5. Delete Email (Move to trash or permanent delete)
app.delete('/api/emails/:id', (req: Request, res: Response) => {
  ensureDataLoaded();
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    deletedEmailIds.add(id);
    saveData();
    return res.json({ success: true, already_deleted: true });
  }

  if (permanent || email.folder === 'trash') {
    goldEmails = goldEmails.filter(e => e.id !== id);
    deletedEmailIds.add(id);
    if (email.raw?.messageId) deletedEmailIds.add(email.raw.messageId);
    saveData();
    return res.json({ success: true, permanent: true });
  } else {
    email.folder = 'trash';
    saveData();
    return res.json({ success: true, folder: 'trash' });
  }
});

// 5b. Restore Email from Trash to Inbox
app.post('/api/emails/:id/restore', (req: Request, res: Response) => {
  ensureDataLoaded();
  const { id } = req.params;
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  email.folder = 'primary';
  deletedEmailIds.delete(id);
  if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);

  saveData();
  return res.json({ success: true, email });
});

// 5c. Empty Trash permanently for user
app.all(['/api/emails/trash/empty', '/api/emails/empty-trash'], (req: Request, res: Response) => {
  ensureDataLoaded();
  const targetEmail = (req.body?.email || req.query?.email || '').toString().toLowerCase().trim();

  const toDelete = goldEmails.filter(e => {
    if (e.folder !== 'trash') return false;
    if (!targetEmail) return true;
    return (
      (e.recipient && e.recipient.toLowerCase().includes(targetEmail)) ||
      (e.to_email && e.to_email.toLowerCase().includes(targetEmail)) ||
      (e.sender && e.sender.toLowerCase().includes(targetEmail)) ||
      (e.from_email && e.from_email.toLowerCase().includes(targetEmail))
    );
  });

  for (const em of toDelete) {
    deletedEmailIds.add(em.id);
    if (em.raw?.messageId) deletedEmailIds.add(em.raw.messageId);
  }

  const deleteIds = new Set(toDelete.map(e => e.id));
  goldEmails = goldEmails.filter(e => !deleteIds.has(e.id));

  saveData();
  return res.json({
    success: true,
    deleted_count: toDelete.length,
    remaining: goldEmails.length
  });
});

// 5d. Batch actions (trash, restore, delete permanent, mark read, mark unread)
app.post('/api/emails/batch-action', (req: Request, res: Response) => {
  ensureDataLoaded();
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const idSet = new Set(ids);
  if (action === 'delete_permanent') {
    for (const id of ids) {
      deletedEmailIds.add(id);
    }
    goldEmails = goldEmails.filter(e => {
      if (idSet.has(e.id)) {
        if (e.raw?.messageId) deletedEmailIds.add(e.raw.messageId);
        return false;
      }
      return true;
    });
  } else if (action === 'trash') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = 'trash';
      }
    }
  } else if (action === 'restore') {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = 'primary';
        deletedEmailIds.delete(e.id);
        if (e.raw?.messageId) deletedEmailIds.delete(e.raw.messageId);
      }
    }
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
  return res.json({ success: true, count: ids.length, action });
});

// 6. Inbound Webhook (Cloudflare Email Routing, Resend, SendGrid, Mailgun, Postmark, AWS SES, or external forwarders)
app.post(
  [
    '/api/inbound',
    '/api/receive-email',
    '/api/emails/inbound',
    '/api/emails/receive',
    '/api/webhook',
    '/api/webhooks/resend',
    '/api/inbound-webhook'
  ],
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      ensureDataLoaded();
      const body = req.body || {};
      const data = body.data || body;
      console.log('[INBOUND WEBHOOK] Received webhook request. Path:', req.path, 'Content-Type:', req.headers['content-type']);

      let to = extractCleanEmail(
        data.to || data.recipient || data.to_email || data.envelope?.to ||
        body.to || body.recipient || body.to_email || body.envelope?.to || body['to'] ||
        req.headers['x-forwarded-to'] || req.headers['delivered-to'] || ''
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

      const newEmail: StoredEmail = {
        id: 'msg_inbound_' + crypto.randomBytes(8).toString('hex'),
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
        category: 'primary'
      };

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

app.post('/api/security/2fa/setup', (req: Request, res: Response) => {
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
  saveData();

  return res.json({
    secret: base32Secret,
    otpauth_url: totp.toString(),
    email: user.email
  });
});

app.post('/api/security/2fa/enable', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
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
  saveData();

  return res.json({
    success: true,
    two_factor_enabled: true,
    backup_codes: user.backup_codes
  });
});

app.post('/api/security/2fa/disable', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.two_factor_enabled = false;
  saveData();
  return res.json({ success: true, two_factor_enabled: false });
});

app.post('/api/security/backup-codes/regenerate', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.backup_codes = generateBackupCodes();
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

// ================= ADMIN APIS (/admin) =================

const requireAdmin = (req: Request, res: Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role !== 'admin' && !decoded.email.includes('admin') && decoded.email !== 'miracle@goldmailer.xyz')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.get('/api/admin/overview', requireAdmin, (_req: Request, res: Response) => {
  const totalStorage = goldUsers.reduce((acc, u) => acc + (u.storage_used_bytes || 0), 0);
  const twilioCfg = getTwilioConfig();
  res.json({
    totalUsers: goldUsers.length,
    totalEmails: goldEmails.length,
    totalDrafts: goldDrafts.length,
    totalOAuthClients: oauthClients.length,
    totalStorageUsedBytes: totalStorage,
    totalStorageUsedMb: (totalStorage / (1024 * 1024)).toFixed(2),
    blockedIpsCount: blockedIps.size,
    recentLogins: userDevices.slice(0, 10),
    adminPhoneNumber: twilioCfg.trialNumber || '+17372508034',
    isTwilioConfigured: twilioCfg.isConfigured
  });
});

app.get('/api/admin/users', requireAdmin, (_req: Request, res: Response) => {
  res.json(goldUsers.map(u => sanitizeUser(u)));
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const user = goldUsers.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.is_banned = !user.is_banned;
  saveData();
  res.json({ success: true, is_banned: user.is_banned });
});

app.delete('/api/admin/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  goldUsers = goldUsers.filter(u => u.id !== id);
  goldEmails = goldEmails.filter(e => e.recipient !== id && !e.recipient.startsWith(id));
  saveData();
  res.json({ success: true });
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
      return {
        id: decoded.id,
        email: decoded.email || user?.email || '',
        role: user?.role || (decoded.email === 'miracle@goldmailer.xyz' ? 'admin' : 'user')
      };
    }
  }
  return { id: '', email: '', role: 'guest' };
};

const isReqAdmin = (authUser: { id: string; email: string; role?: string }): boolean => {
  if (!authUser.email) return false;
  return (
    authUser.email.toLowerCase() === 'miracle@goldmailer.xyz' ||
    authUser.role === 'admin' ||
    authUser.id === 'usr_miracle_01'
  );
};

// TASK 1: TWILIO WEBHOOK (Receive From, To, Body, MessageSid, save to sms_inbox, return TwiML)
export const handleTwilioSmsWebhook = async (req: Request, res: Response) => {
  try {
    ensureDataLoaded();
    const body = req.body || {};
    const from = String(body.From || body.from || '').trim();
    const to = String(body.To || body.to || '').trim();
    const text = String(body.Body || body.body || '').trim();
    const messageSid = String(body.MessageSid || body.messageSid || body.SmsSid || '').trim();

    console.log(`[TWILIO WEBHOOK] Received SMS. From: "${from}", To: "${to}", Body: "${text}", Sid: "${messageSid}"`);

    // Normalize 'To' number to find user in database
    const cleanTo = to.replace(/[^\d+]/g, '');
    const matchedNumber = userPhoneNumbers.find(p => p.phoneNumber.replace(/[^\d+]/g, '') === cleanTo);
    const targetUser = matchedNumber
      ? goldUsers.find(u => u.id === matchedNumber.userId)
      : (goldUsers.find(u => u.phone && u.phone.replace(/[^\d+]/g, '') === cleanTo) || goldUsers[0]);

    const targetUserId = targetUser?.id || (matchedNumber ? matchedNumber.userId : 'usr_miracle_01');

    const newSms: StoredSMS = {
      id: 'sms_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: targetUserId,
      from: from || 'Unknown Sender',
      to: to || cleanTo || '+17372508034',
      body: text,
      receivedAt: new Date().toISOString(),
      messageSid: messageSid || 'SM_' + Date.now(),
      direction: 'inbound',
      status: 'received',
      is_read: false
    };

    sms_inbox.unshift(newSms);
    saveData();
    broadcastNewSMS(newSms);

    console.log(`[TWILIO WEBHOOK] Saved incoming SMS ${newSms.id} for user ${targetUserId}`);

    // Return HTTP 200 with empty TwiML <Response></Response>
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  } catch (err: any) {
    console.error('[TWILIO WEBHOOK] Exception handling webhook:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
};

app.post(
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

  // Ensure miracle@goldmailer.xyz has the free phone number
  if (isAdmin) {
    const adminPhoneIndex = userPhoneNumbers.findIndex(
      p => p.phoneNumber === trialNumber && (p.userId === authUser.id || p.userEmail === 'miracle@goldmailer.xyz')
    );
    if (adminPhoneIndex === -1) {
      userPhoneNumbers.unshift({
        id: 'phone_free_miracle_admin',
        userId: authUser.id || 'usr_miracle_01',
        userEmail: authUser.email || 'miracle@goldmailer.xyz',
        phoneNumber: trialNumber,
        friendlyName: `${trialNumber} (Admin Line)`,
        provider: 'twilio',
        status: 'active',
        purchasedAt: '2026-10-08T00:00:00.000Z',
        expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
        autoRenew: true,
        capabilities: { sms: true, voice: true }
      });
      saveData();
    }
  }

  // Strictly do NOT give free trial numbers to regular users!
  // Only return numbers the user actually owns/purchased (or admin's line if admin)
  const list = userPhoneNumbers.filter(
    p => (authUser.id && p.userId === authUser.id) || (isAdmin && p.phoneNumber === trialNumber)
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

// 11. GET /api/phone/sms - Retrieve user's SMS inbox
app.get('/api/phone/sms', (req: Request, res: Response) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = authUser.email === 'miracle@goldmailer.xyz' || authUser.id === 'usr_miracle_01';
  const userPhones = new Set(
    userPhoneNumbers
      .filter(p => p.userId === authUser.id || (isAdmin && p.id === 'phone_free_miracle_admin'))
      .map(p => p.phoneNumber)
  );

  const list = sms_inbox.filter(s => {
    if (s.userId === authUser.id) return true;
    if (userPhones.has(s.to) || userPhones.has(s.from)) return true;
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
