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
import { fetchEmailsFromImap, extractCleanAddress } from './imapService.js';

// Server-Sent Events (SSE) for Real-Time email receiving
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
const resendFrom = process.env.RESEND_FROM || 'GoldMailer <noreply@goldmailer.xyz>';
let resendClient: Resend | null = null;
if (resendApiKey) {
  try {
    resendClient = new Resend(resendApiKey);
  } catch (err) {
    console.warn('⚠️ Resend init error:', err);
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
const DATA_FILE = isServerless
  ? path.join('/tmp', '.goldmailer_data.json')
  : path.join(process.cwd(), '.goldmailer_data.json');

let goldUsers: StoredGoldUser[] = [];
let goldEmails: StoredEmail[] = [];
let goldDrafts: StoredDraft[] = [];
let userDevices: StoredDevice[] = [];
let loginAttempts: StoredLoginAttempt[] = [];
let oauthClients: StoredOAuthClient[] = [];
let oauthCodes: StoredOAuthCode[] = [];
let oauthTokens: StoredOAuthToken[] = [];
let blockedIps: Set<string> = new Set();

// Helper: 10 random 8-digit backup codes
const generateBackupCodes = (): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
};

// Seed / Update Accounts (Miracle@goldmailer.xyz password: @654413Mm)
const seedAccounts = () => {
  const miracleUsername = 'miracle';
  const miracleEmail = 'miracle@goldmailer.xyz';
  // Password specified: @654413Mm
  const miraclePasswordHash = bcrypt.hashSync('@654413Mm', 10);

  const existingMiracle = goldUsers.find(
    u => u.username.toLowerCase() === miracleUsername || u.email.toLowerCase() === miracleEmail
  );

  if (existingMiracle) {
    // Ensure password is unconditionally updated to @654413Mm as requested
    existingMiracle.password_hash = miraclePasswordHash;
    existingMiracle.is_banned = false;
  } else {
    goldUsers.push({
      id: 'usr_miracle_01',
      email: miracleEmail,
      username: miracleUsername,
      password_hash: miraclePasswordHash,
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
      storage_used_bytes: 420 * 1024 * 1024, // 420 MB
      storage_limit_bytes: 15 * 1024 * 1024 * 1024, // 15 GB
      avatar_url: ''
    });
  }

  // Ensure default welcome email exists
  if (!goldEmails.some(e => (e.recipient || '').toLowerCase().includes(miracleEmail))) {
    goldEmails.push({
      id: 'msg_welcome_goldmailer',
      recipient: miracleEmail,
      to_email: miracleEmail,
      to: miracleEmail,
      sender: 'GoldMailer Team <team@goldmailer.xyz>',
      from_email: 'team@goldmailer.xyz',
      from: 'team@goldmailer.xyz',
      sender_name: 'GoldMailer Team',
      subject: 'Welcome to your permanent GoldMailer account! ✉️',
      body_html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 22px;">G</div>
            <h2 style="color: #FF6A00; margin: 0; font-size: 20px;">Welcome to GoldMailer!</h2>
          </div>
          <p>Hello Miracle,</p>
          <p>Your permanent email <strong>${miracleEmail}</strong> is configured and ready.</p>
          <div style="background: rgba(255,106,0,0.08); padding: 14px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #FF6A00;">
            <p style="margin: 0;"><strong>Storage Quota:</strong> 15 GB Permanent Storage</p>
            <p style="margin: 4px 0 0;"><strong>Security:</strong> Password Protected & 2FA Ready</p>
            <p style="margin: 4px 0 0;"><strong>Multi-Account:</strong> Switch seamlessly between accounts</p>
          </div>
          <p style="color: #666; font-size: 13px;">GoldMailer Team · Fast, Secure Email for Everyone</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer!\n\nHello Miracle,\nYour permanent email ${miracleEmail} is ready with 15GB storage.\n\nGoldMailer Team`,
      received_at: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date(Date.now() - 3600000).toISOString(),
      is_read: true,
      is_starred: true,
      folder: 'primary',
      category: 'primary'
    });
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
};

// Load persistent data
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    goldUsers = parsed.goldUsers || [];
    goldEmails = parsed.goldEmails || [];
    goldDrafts = parsed.goldDrafts || [];
    userDevices = parsed.userDevices || [];
    loginAttempts = parsed.loginAttempts || [];
    oauthClients = parsed.oauthClients || [];
    oauthCodes = parsed.oauthCodes || [];
    oauthTokens = parsed.oauthTokens || [];
    if (parsed.blockedIps) {
      blockedIps = new Set(parsed.blockedIps);
    }
  }
} catch (e) {
  console.warn('Notice: initialized memory store');
}

seedAccounts();

const saveData = () => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          goldUsers,
          goldEmails,
          goldDrafts,
          userDevices,
          loginAttempts: loginAttempts.slice(-100),
          oauthClients,
          oauthCodes: oauthCodes.slice(-50),
          oauthTokens: oauthTokens.slice(-100),
          blockedIps: Array.from(blockedIps)
        },
        null,
        2
      )
    );
  } catch (e) {
    console.warn('Save data warning:', e);
  }
};

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

// 3. Register Permanent GoldMailer Account (Direct - NO SMS code required)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, dob, gender, username, password, phone, country } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: 'First name, username, and password are required' });
    }

    const cleanUsername = username.replace(/@.*$/, '').trim().toLowerCase();
    const cleanEmail = `${cleanUsername}@goldmailer.xyz`;

    if (goldUsers.some(u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: `Username @${cleanUsername} is already registered. Please choose another.` });
    }

    const passwordHash = bcrypt.hashSync(String(password).trim(), 10);
    const backupCodes = generateBackupCodes();

    const newUser: StoredGoldUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      email: cleanEmail,
      username: cleanUsername,
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
      role: cleanUsername.includes('admin') ? 'admin' : 'user',
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

// 4. User Login (Supports Miracle@goldmailer.xyz with @654413Mm and any registered user)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { identifier, email, password } = req.body;
    const loginInput = (identifier || email || '').toLowerCase().trim();
    if (!loginInput || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    const cleanUsername = loginInput.replace(/@goldmailer\.xyz$/, '').replace(/@.*$/, '').trim();
    const user = goldUsers.find(
      u => u.username.toLowerCase() === cleanUsername ||
           u.email.toLowerCase() === loginInput ||
           u.email.toLowerCase() === `${cleanUsername}@goldmailer.xyz`
    );

    if (!user) {
      return res.status(404).json({ error: 'No GoldMailer account found with that email or username.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended by administrators.' });
    }

    // Special check for Miracle@goldmailer.xyz: if password is @654413Mm, guarantee match
    let passwordMatch = false;
    if (
      (user.username.toLowerCase() === 'miracle' || user.email.toLowerCase() === 'miracle@goldmailer.xyz') &&
      String(password).trim() === '@654413Mm'
    ) {
      passwordMatch = true;
    } else {
      passwordMatch = bcrypt.compareSync(String(password).trim(), user.password_hash);
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
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

// 5. Get Current User Profile (/api/auth/me)
app.get('/api/auth/me', (req: Request, res: Response) => {
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

// 7. Get Default Miracle Account Session (Instant auto-login helper)
app.get('/api/auth/default-session', (_req: Request, res: Response) => {
  const miracle = goldUsers.find(u => u.email.toLowerCase() === 'miracle@goldmailer.xyz');
  if (!miracle) {
    return res.status(404).json({ error: 'Default account not found' });
  }
  const token = generateToken({
    id: miracle.id,
    email: miracle.email,
    username: miracle.username,
    role: miracle.role
  });
  return res.json({
    success: true,
    token,
    user: sanitizeUser(miracle)
  });
});

// ================= EMAIL MESSAGES & SYNCING (PERMANENT & STABLE) =================

// 1. GET emails for user or recipient
app.get('/api/emails/:emailAddress', async (req: Request, res: Response) => {
  try {
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
    const { email } = req.body;
    const cleanTarget = (email || 'miracle@goldmailer.xyz').toLowerCase().trim();
    let newItemsCount = 0;

    // A. Fetch via IMAP if configured (IMAP_HOST, IMAP_USER, IMAP_PASS)
    try {
      const imapMessages = await fetchEmailsFromImap(cleanTarget);
      for (const im of imapMessages) {
        const already = goldEmails.some(e => e.id === im.id || (im.messageId && e.raw?.messageId === im.messageId));
        if (!already) {
          goldEmails.unshift(im);
          newItemsCount++;
          broadcastNewEmail(im);
        }
      }
    } catch (imapErr) {
      console.warn('IMAP sync note:', imapErr);
    }

    // B. Fetch via Resend receiving API if configured
    if (resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        if (client.emails && (client.emails as any).receiving && typeof (client.emails as any).receiving.list === 'function') {
          const recRes = await (client.emails as any).receiving.list({ limit: 100 });
          if (recRes && Array.isArray(recRes.data)) {
            for (const item of recRes.data) {
              const itemTo = extractCleanAddress(item.to);
              if (!cleanTarget || itemTo.includes(cleanTarget) || cleanTarget.includes(itemTo)) {
                const already = goldEmails.some(e => e.id === String(item.id) || e.id === `msg_${item.id}`);
                if (!already) {
                  let fullItem = item;
                  try {
                    const fullRes = await (client.emails as any).receiving.get(item.id);
                    if (fullRes && fullRes.data) fullItem = fullRes.data;
                  } catch {}

                  const html = fullItem.html || fullItem.body_html || '';
                  const text = fullItem.text || fullItem.body_text || '';
                  const finalHtml = html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`;

                  const syncedEmail: StoredEmail = {
                    id: String(item.id),
                    recipient: itemTo || cleanTarget,
                    to_email: itemTo || cleanTarget,
                    to: itemTo || cleanTarget,
                    sender: extractCleanAddress(fullItem.from),
                    from_email: extractCleanAddress(fullItem.from),
                    from: extractCleanAddress(fullItem.from),
                    sender_name: extractCleanAddress(fullItem.from).split('@')[0],
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
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Resend receiving sync note:', e);
      }
    }

    if (newItemsCount > 0) {
      saveData();
    }

    return res.json({
      success: true,
      new_emails_synced: newItemsCount,
      total_emails: goldEmails.length,
      synced_at: new Date().toISOString()
    });
  } catch (err: any) {
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
    const userMainEmail = (authUser?.email || sender || 'miracle@goldmailer.xyz').toLowerCase().trim();
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
    const { to, from, sender_name, subject, body_html, body_text } = req.body;
    const recipient = (to || 'miracle@goldmailer.xyz').toLowerCase().trim();
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

    return res.json({ success: true, email: incoming });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Update Email Read/Star/Folder
app.patch('/api/emails/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_read, is_starred, folder } = req.body;
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  if (is_read !== undefined) email.is_read = is_read;
  if (is_starred !== undefined) email.is_starred = is_starred;
  if (folder !== undefined) email.folder = folder;

  saveData();
  return res.json({ success: true, email });
});

// 5. Delete Email
app.delete('/api/emails/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';
  const email = goldEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  if (permanent || email.folder === 'trash') {
    goldEmails = goldEmails.filter(e => e.id !== id);
  } else {
    email.folder = 'trash';
  }

  saveData();
  return res.json({ success: true });
});

// 6. Inbound Webhook (Cloudflare Email Routing, Resend, SendGrid, Mailgun, or external forwarders)
app.post(['/api/inbound', '/api/receive-email', '/api/emails/inbound', '/api/emails/receive', '/api/webhook', '/api/webhooks/resend', '/api/inbound-webhook'], async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const data = body.data || body;
    let to = extractCleanEmail(data.to || data.recipient || data.to_email || body.to || body.recipient || body.to_email || body['to'] || '');
    let from = extractCleanSender(data.from || data.sender || data.from_email || body.from || body.sender || body.from_email || 'external@sender.com');
    let subject = String(data.subject || body.subject || '(No Subject)');
    let html = String(data.html || data.body_html || data['body-html'] || body.html || body.body_html || body['body-html'] || '');
    let text = String(data.text || data.body_text || data['body-plain'] || body.text || body.body_text || body['body-plain'] || '');

    // Resend inbound webhook resolution if payload only has email_id
    const emailId = body.email_id || body.data?.email_id || body.id || data.id;
    if (emailId && (!html || !text) && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        const fullRes = await (client.emails as any).receiving.get(emailId);
        if (fullRes && fullRes.data) {
          const item = fullRes.data;
          to = extractCleanEmail(item.to || to);
          from = extractCleanSender(item.from || from);
          subject = item.subject || subject;
          html = item.html || item.body_html || html;
          text = item.text || item.body_text || text;
        }
      } catch (err) {
        console.warn('Resend webhook detail retrieval note:', err);
      }
    }

    const finalRecipient = to || 'miracle@goldmailer.xyz';
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
      body_text: text || html.replace(/<[^>]+>/g, ' ').trim(),
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
    return res.json({ success: true, id: newEmail.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

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
  res.json({
    totalUsers: goldUsers.length,
    totalEmails: goldEmails.length,
    totalDrafts: goldDrafts.length,
    totalOAuthClients: oauthClients.length,
    totalStorageUsedBytes: totalStorage,
    totalStorageUsedMb: (totalStorage / (1024 * 1024)).toFixed(2),
    blockedIpsCount: blockedIps.size,
    recentLogins: userDevices.slice(0, 10)
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

export default function handler(req: any, res: any) {
  return app(req, res);
}

export { app };
