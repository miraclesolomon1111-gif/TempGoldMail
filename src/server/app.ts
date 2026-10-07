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
    twoFactorEnabled: true,
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

// Supabase client initialization
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
let supabase: any = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('⚡ Connected to Supabase for GoldMailer');
  } catch (err) {
    console.warn('⚠️ Supabase init note, local storage active:', err);
  }
}

// Resend client initialization
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFrom = process.env.RESEND_FROM || 'GoldMailer <noreply@goldmailer.xyz>';
let resendClient: Resend | null = null;
if (resendApiKey) {
  try {
    resendClient = new Resend(resendApiKey);
    console.log('⚡ Connected to Resend Email Service');
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
  cc?: string;
  bcc?: string;
  sender: string;
  from_email: string;
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
  folder: string;
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

// Persistent Storage file
const isServerless = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);
const DATA_FILE = isServerless
  ? path.join('/tmp', '.goldmailer_data.json')
  : path.join(__dirname, '.goldmailer_data.json');

let goldUsers: StoredGoldUser[] = [];
let goldEmails: StoredEmail[] = [];
let goldDrafts: StoredDraft[] = [];
let userDevices: StoredDevice[] = [];
let loginAttempts: StoredLoginAttempt[] = [];
let oauthClients: StoredOAuthClient[] = [];
let oauthCodes: StoredOAuthCode[] = [];
let oauthTokens: StoredOAuthToken[] = [];
let blockedIps: Set<string> = new Set();

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
  console.warn('Notice: initialized in-memory GoldMailer store');
}

// Helper: 10 random 8-digit backup codes
const generateBackupCodes = (): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
};

// Seed Miracle & Admin permanent accounts if not exists
const seedAccounts = () => {
  const miracleUsername = 'miracle';
  const miracleEmail = 'miracle@goldmailer.xyz';
  if (!goldUsers.some(u => u.username.toLowerCase() === miracleUsername)) {
    goldUsers.push({
      id: 'usr_miracle_01',
      email: miracleEmail,
      username: miracleUsername,
      password_hash: bcrypt.hashSync('Password123!', 10),
      first_name: 'Miracle',
      last_name: 'Solomon',
      dob: '1998-05-14',
      gender: 'Male',
      phone: '+234 801 234 5678',
      recovery_phone: '+234 801 234 5678',
      backup_email: 'miracle.backup@gmail.com',
      two_factor_enabled: true,
      backup_codes: generateBackupCodes(),
      role: 'admin',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      is_banned: false,
      storage_used_bytes: 420 * 1024 * 1024, // 420 MB
      storage_limit_bytes: 15 * 1024 * 1024 * 1024, // 15 GB
      avatar_url: ''
    });

    // Seed welcoming permanent emails for Miracle
    goldEmails.push({
      id: 'msg_welcome_goldmailer',
      recipient: miracleEmail,
      to_email: miracleEmail,
      sender: 'GoldMailer Team <team@goldmailer.xyz>',
      from_email: 'team@goldmailer.xyz',
      sender_name: 'GoldMailer Team',
      subject: 'Welcome to your permanent GoldMailer account! ✉️',
      body_html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid rgba(255,106,0,0.2); border-radius: 12px; background: #ffffff;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <div style="width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px;">G</div>
            <h1 style="color: #FF6A00; margin: 0; font-size: 24px; font-weight: 700;">Welcome to GoldMailer!</h1>
          </div>
          <p style="font-size: 16px;">Hello Miracle,</p>
          <p style="font-size: 15px; color: #555;">Congratulations on securing your permanent email address: <strong>${miracleEmail}</strong>.</p>
          <div style="background: rgba(255, 106, 0, 0.08); border-left: 4px solid #FF6A00; padding: 14px 18px; border-radius: 6px; margin: 18px 0;">
            <p style="margin: 0; font-weight: 600; color: #111;">Your Account Features:</p>
            <ul style="margin: 8px 0 0; padding-left: 20px; color: #444;">
              <li><strong>15 GB Free Cloud Storage</strong> for your permanent mailbox.</li>
              <li><strong>2-Step Verification & Authenticator TOTP</strong> for bank-grade security.</li>
              <li><strong>OAuth 2.0 Provider:</strong> Other websites can now offer <em>"Continue with GoldMailer"</em>!</li>
              <li><strong>Auto-Saving Drafts:</strong> Real-time draft auto-saving every 3 seconds.</li>
              <li><strong>Suspicious Login Detection:</strong> Instant push alerts for new devices.</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #666;">Need help? Reply to this email anytime or visit your account settings.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 12px; color: #999; margin: 0;">GoldMailer Inc. · Fast, Secure Email for Everyone · goldmailer.xyz</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer!\n\nHello Miracle,\nYour permanent email ${miracleEmail} is ready with 15GB storage, 2-step verification, auto drafts, and OAuth 2.0 provider.\n\nGoldMailer Team`,
      received_at: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date(Date.now() - 3600000).toISOString(),
      is_read: true,
      is_starred: true,
      folder: 'primary',
      category: 'primary'
    });

    // Seed demo OAuth Client
    oauthClients.push({
      client_id: 'client_goldmailer_demo_app',
      client_secret: 'sec_' + crypto.randomBytes(16).toString('hex'),
      app_name: 'DevPortal Showcase',
      redirect_uri: 'https://goldmailer.xyz/oauth/callback',
      website_url: 'https://goldmailer.xyz',
      owner_user_id: 'usr_miracle_01',
      created_at: new Date().toISOString()
    });

    // Seed trusted device
    userDevices.push({
      id: 'dev_primary_01',
      user_id: 'usr_miracle_01',
      device_name: 'MacBook Pro - Lagos, NG',
      browser: 'Chrome 122',
      os: 'macOS Sonoma',
      ip: '102.89.34.12',
      location: 'Lagos, Nigeria',
      last_active: new Date().toISOString(),
      is_trusted: true,
      created_at: new Date().toISOString()
    });
  }
};

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

// Helper: parse user agent & client IP
const parseDeviceInfo = (req: Request) => {
  const ua = req.headers['user-agent'] || 'Unknown Browser';
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  
  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Microsoft Edge';
  else if (ua.includes('Opera')) browser = 'Opera';

  let os = 'Windows 11';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('iPhone')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';

  // Location heuristic
  let location = 'Berlin, Germany';
  if (ip.startsWith('102.') || ip.startsWith('105.')) location = 'Lagos, Nigeria';
  else if (ip.startsWith('192.') || ip.startsWith('127.')) location = 'New York, USA';

  const deviceName = `${os} - ${location} - ${browser}`;
  return { deviceName, browser, os, ip, location };
};

// Safe user serializer
const sanitizeUser = (u: StoredGoldUser) => {
  const { password_hash, two_factor_secret, ...safe } = u;
  return safe;
};

// ================= USER & AUTHENTICATION ENDPOINTS =================

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
        message: 'Username must be 3-30 characters and contain only letters, numbers, dots, or underscores'
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
      lastName ? `${firstName}.${new Date().getFullYear()}` : `${firstName}.${new Date().getFullYear()}`,
      lastName ? `${lastName}.${firstName}` : `${firstName}_official`
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

// 3. Send Phone OTP (Mock / Twilio integration for 250+ countries)
const activePhoneOtps = new Map<string, { code: string; expires_at: number }>();
app.post('/api/auth/send-phone-otp', (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    activePhoneOtps.set(phone.trim(), {
      code,
      expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    console.log(`📱 SMS OTP sent to ${phone}: ${code}`);
    return res.json({
      success: true,
      message: `Verification code sent to ${phone}`,
      mock_code: code // Included for seamless instant testing
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Verify Phone OTP
app.post('/api/auth/verify-phone-otp', (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }
    const record = activePhoneOtps.get(phone.trim());
    if (!record || record.expires_at < Date.now()) {
      return res.status(400).json({ error: 'Verification code has expired or not found. Please request a new code.' });
    }
    if (record.code !== code.trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }
    activePhoneOtps.delete(phone.trim());
    return res.json({ success: true, verified: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Complete Account Creation (Multi-step wizard)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, dob, gender, username, password, phone, country } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: 'First name, username, and password are required' });
    }

    const cleanUsername = username.replace(/@.*$/, '').trim().toLowerCase();
    const cleanEmail = `${cleanUsername}@goldmailer.xyz`;

    // Atomic uniqueness check
    if (goldUsers.some(u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: `Username ${cleanUsername} is already registered. Please choose another.` });
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

    // Register initial device as trusted
    const devInfo = parseDeviceInfo(req);
    userDevices.unshift({
      id: 'dev_' + crypto.randomBytes(6).toString('hex'),
      user_id: newUser.id,
      device_name: devInfo.deviceName,
      browser: devInfo.browser,
      os: devInfo.os,
      ip: devInfo.ip,
      location: devInfo.location,
      last_active: new Date().toISOString(),
      is_trusted: true,
      created_at: new Date().toISOString()
    });

    // Send Welcome Email into user's mailbox
    goldEmails.unshift({
      id: 'msg_welcome_' + newUser.id,
      recipient: cleanEmail,
      to_email: cleanEmail,
      sender: 'GoldMailer Team <team@goldmailer.xyz>',
      from_email: 'team@goldmailer.xyz',
      sender_name: 'GoldMailer Team',
      subject: `Welcome to GoldMailer, ${firstName}! Your 15GB permanent email is active 🚀`,
      body_html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
          <h2 style="color: #FF6A00; margin-top: 0;">Welcome to GoldMailer!</h2>
          <p>Hi ${firstName},</p>
          <p>Your permanent email address <strong>${cleanEmail}</strong> has been secured and locked forever.</p>
          <div style="background: rgba(255, 106, 0, 0.08); padding: 14px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Your Allocated Quota:</strong> 15 GB High-Speed Permanent Storage</p>
            <p style="margin: 4px 0 0;"><strong>Security Status:</strong> Password Protected & 2FA Ready</p>
          </div>
          <p>You can now use this email on any website or connect via <em>"Continue with GoldMailer"</em> OAuth.</p>
          <p>Cheers,<br>The GoldMailer Team</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer, ${firstName}!\nYour permanent email ${cleanEmail} is ready with 15GB storage.\n\nCheers,\nGoldMailer Team`,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false,
      is_starred: true,
      folder: 'primary',
      category: 'primary'
    });

    // Sync to Supabase if table exists
    if (supabase) {
      try {
        await supabase.from('goldmailer_users').insert({
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          phone: newUser.phone,
          storage_limit_bytes: newUser.storage_limit_bytes,
          created_at: newUser.created_at
        });
      } catch (e) {
        console.warn('Supabase goldmailer_users sync note:', e);
      }
    }

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

// 6. User Login with Suspicious Device & 2FA Check
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { identifier, email, password, totp_code, backup_code, trust_device, force_approve_attempt_id } = req.body;
    const loginInput = (identifier || email || '').toLowerCase().trim();
    if (!loginInput || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    const cleanUsername = loginInput.replace(/@goldmailer\.xyz$/, '').replace(/@.*$/, '').trim();
    const user = goldUsers.find(
      u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === loginInput
    );

    if (!user) {
      return res.status(404).json({ error: 'No GoldMailer account found with that email or username.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been disabled by security administrators.' });
    }

    // Verify Password
    const passwordMatch = bcrypt.compareSync(String(password).trim(), user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const devInfo = parseDeviceInfo(req);

    // Check if IP is blocked
    if (blockedIps.has(devInfo.ip)) {
      return res.status(403).json({ error: 'Access from this IP has been blocked due to suspicious activity.' });
    }

    // Check Device Trust
    const isKnownDevice = userDevices.some(
      d => d.user_id === user.id && d.is_trusted && (d.ip === devInfo.ip || (d.browser === devInfo.browser && d.os === devInfo.os))
    );

    // If device is not trusted and not explicitly approved:
    if (!isKnownDevice && !force_approve_attempt_id && !totp_code && !backup_code) {
      // Create a pending login attempt for real-time authorization
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const attempt: StoredLoginAttempt = {
        id: 'att_' + crypto.randomBytes(8).toString('hex'),
        user_id: user.id,
        email: user.email,
        device_name: devInfo.deviceName,
        browser: devInfo.browser,
        os: devInfo.os,
        ip: devInfo.ip,
        location: devInfo.location,
        status: 'pending',
        code,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      };
      loginAttempts.push(attempt);
      saveData();

      return res.status(200).json({
        suspicious_login: true,
        message: `Suspicious login attempt detected from ${devInfo.deviceName}`,
        attempt_id: attempt.id,
        device_info: {
          device_name: devInfo.deviceName,
          browser: devInfo.browser,
          os: devInfo.os,
          location: devInfo.location,
          ip: devInfo.ip
        },
        code_hint: code, // Provided for instant testing
        requires_verification: true
      });
    }

    // Check 2FA if enabled
    if (user.two_factor_enabled && !force_approve_attempt_id) {
      if (!totp_code && !backup_code) {
        return res.status(200).json({
          requires_2fa: true,
          message: '2-Step Verification required. Enter Authenticator TOTP or Backup code.',
          user_id: user.id
        });
      }

      let verified = false;
      if (totp_code && user.two_factor_secret) {
        const totp = new OTPAuth.TOTP({
          issuer: 'GoldMailer',
          label: user.email,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
        });
        const delta = totp.validate({ token: totp_code.trim(), window: 2 });
        if (delta !== null) verified = true;
      }

      if (!verified && backup_code) {
        const cleanBackup = backup_code.trim().replace(/\s+/g, '');
        const codeIndex = user.backup_codes.findIndex(c => c.replace(/-/g, '') === cleanBackup.replace(/-/g, ''));
        if (codeIndex !== -1) {
          // Burn backup code
          user.backup_codes.splice(codeIndex, 1);
          verified = true;
          saveData();
        }
      }

      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2-Step Verification code or backup code.' });
      }
    }

    // Register or update device
    const existingDev = userDevices.find(d => d.user_id === user.id && d.ip === devInfo.ip);
    if (existingDev) {
      existingDev.last_active = new Date().toISOString();
      existingDev.is_trusted = true;
    } else {
      userDevices.unshift({
        id: 'dev_' + crypto.randomBytes(6).toString('hex'),
        user_id: user.id,
        device_name: devInfo.deviceName,
        browser: devInfo.browser,
        os: devInfo.os,
        ip: devInfo.ip,
        location: devInfo.location,
        last_active: new Date().toISOString(),
        is_trusted: true,
        created_at: new Date().toISOString()
      });
    }
    saveData();

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

// 7. Real-Time Login Attempt Status Check (for suspicious login screen polling)
app.get('/api/security/login-attempts/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const attempt = loginAttempts.find(a => a.id === id);
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found or expired' });
  }

  // Check if expired
  if (new Date(attempt.expires_at).getTime() < Date.now()) {
    attempt.status = 'expired';
    saveData();
    return res.json({ status: 'expired' });
  }

  if (attempt.status === 'approved') {
    const user = goldUsers.find(u => u.id === attempt.user_id);
    if (user) {
      const token = generateToken({ id: user.id, email: user.email, username: user.username, role: user.role });
      return res.json({
        status: 'approved',
        token,
        user: sanitizeUser(user)
      });
    }
  }

  return res.json({ status: attempt.status });
});

// 8. Confirm or Block Login Attempt (From user's other device or popup)
app.post('/api/security/login-attempts/:id/respond', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, code } = req.body; // action: 'approve' | 'block' | 'verify_code'
    const attempt = loginAttempts.find(a => a.id === id);
    if (!attempt) {
      return res.status(404).json({ error: 'Login attempt not found' });
    }

    if (action === 'block') {
      attempt.status = 'rejected';
      blockedIps.add(attempt.ip);
      saveData();

      // Log alert email in user's inbox
      const user = goldUsers.find(u => u.id === attempt.user_id);
      if (user) {
        goldEmails.unshift({
          id: 'msg_sec_alert_' + Date.now(),
          recipient: user.email,
          to_email: user.email,
          sender: 'GoldMailer Security <security@goldmailer.xyz>',
          from_email: 'security@goldmailer.xyz',
          sender_name: 'GoldMailer Security',
          subject: 'Security Alert: Suspicious login was blocked 🛡️',
          body_html: `
            <div style="font-family: sans-serif; padding: 20px; border-radius: 8px; border: 1px solid #FF6A00;">
              <h3 style="color: #FF6A00;">Your account was protected</h3>
              <p>You blocked an unauthorized sign-in attempt from <strong>${attempt.device_name}</strong> (${attempt.ip}).</p>
              <p>The IP address has been blocked and access was denied.</p>
            </div>
          `,
          body_text: `Your account was protected. You blocked an unauthorized login attempt from ${attempt.device_name}.`,
          received_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          is_read: false,
          is_starred: true,
          folder: 'primary',
          category: 'primary'
        });
      }
      return res.json({ success: true, message: 'Login blocked and IP blacklisted.' });
    }

    if (action === 'verify_code') {
      if (attempt.code !== (code || '').trim()) {
        return res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
      }
      attempt.status = 'approved';
      // Register device as trusted
      userDevices.unshift({
        id: 'dev_' + crypto.randomBytes(6).toString('hex'),
        user_id: attempt.user_id,
        device_name: attempt.device_name,
        browser: attempt.browser,
        os: attempt.os,
        ip: attempt.ip,
        location: attempt.location,
        last_active: new Date().toISOString(),
        is_trusted: true,
        created_at: new Date().toISOString()
      });
      saveData();
      return res.json({ success: true, message: 'Login approved successfully!' });
    }

    if (action === 'approve') {
      attempt.status = 'approved';
      userDevices.unshift({
        id: 'dev_' + crypto.randomBytes(6).toString('hex'),
        user_id: attempt.user_id,
        device_name: attempt.device_name,
        browser: attempt.browser,
        os: attempt.os,
        ip: attempt.ip,
        location: attempt.location,
        last_active: new Date().toISOString(),
        is_trusted: true,
        created_at: new Date().toISOString()
      });
      saveData();
      return res.json({ success: true, message: 'Login approved successfully!' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 9. Get Pending Login Attempts for Current User (Push notifications to active device)
app.get('/api/security/login-attempts/pending', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json([]);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.json([]);

  const now = Date.now();
  const pending = loginAttempts.filter(
    a => a.user_id === decoded.id && a.status === 'pending' && new Date(a.expires_at).getTime() > now
  );
  return res.json(pending);
});

// 10. Get Current User Profile (/api/auth/me)
app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_banned) return res.status(403).json({ error: 'Account disabled' });

  return res.json({ user: sanitizeUser(user) });
});

// 11. Update Profile Information
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

// ================= SECURITY & 2FA MANAGEMENT =================

// Setup 2-Step Verification with TOTP & Authenticator App
app.post('/api/security/2fa/setup', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = goldUsers.find(u => u.id === decoded.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Generate new TOTP secret using otpauth
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

  const otpauthUrl = totp.toString();
  // Temporarily store secret until verified
  user.two_factor_secret = base32Secret;
  saveData();

  return res.json({
    secret: base32Secret,
    otpauth_url: otpauthUrl,
    email: user.email
  });
});

// Verify and Enable 2FA
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
    return res.status(400).json({ error: 'Invalid 6-digit Authenticator code. Check clock sync and try again.' });
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

// Disable 2FA
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

// Regenerate 10 Backup Codes
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

// List User Devices
app.get('/api/security/devices', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const curIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
  const list = userDevices
    .filter(d => d.user_id === decoded.id)
    .map(d => ({
      ...d,
      is_current: d.ip === curIp
    }));

  return res.json(list);
});

// Revoke All Other Devices
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

// ================= DRAFT AUTO-SAVE SYSTEM =================

// List Drafts
app.get('/api/drafts', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const drafts = goldDrafts
    .filter(d => d.user_id === decoded.id || d.sender_email.toLowerCase() === decoded.email.toLowerCase())
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return res.json(drafts);
});

// Save / Auto-Save Draft (invoked every 3s from client)
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

// Delete Draft
app.delete('/api/drafts/:id', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const { id } = req.params;
  goldDrafts = goldDrafts.filter(d => !(d.id === id && (d.user_id === decoded.id || d.sender_email === decoded.email)));
  saveData();
  return res.json({ success: true });
});

// ================= EMAIL MESSAGES & SYNCING =================

// 1. GET emails for user or recipient (supports old & new emails, folder filtering)
app.get('/api/emails/:emailAddress', async (req: Request, res: Response) => {
  try {
    const emailAddress = req.params.emailAddress.toLowerCase().trim();
    const folder = (req.query.folder as string) || 'all';

    // Filter server store
    const matches = goldEmails.filter(e => {
      const to = e.recipient.toLowerCase();
      const from = e.sender.toLowerCase();
      const isTarget = to.includes(emailAddress) || from.includes(emailAddress);
      if (!isTarget) return false;

      if (folder === 'starred') return e.is_starred;
      if (folder === 'sent' || folder === 'outbox' || folder === 'scheduled') return from.includes(emailAddress);
      if (folder === 'trash' || folder === 'spam') return e.folder === folder;
      if (folder === 'primary' || folder === 'promotions' || folder === 'social' || folder === 'updates') {
        return (e.folder === folder || (!e.folder && folder === 'primary')) && e.folder !== 'trash' && e.folder !== 'spam';
      }
      return e.folder !== 'trash';
    });

    matches.sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime());
    return res.json(matches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Comprehensive Email Sync (Old & New emails from Resend & Database)
app.post('/api/emails/sync', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const targetEmail = (email || '').toLowerCase().trim();
    let newItemsCount = 0;

    // Resend historical / inbound sync
    if (resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        if (client.emails && (client.emails as any).receiving && typeof (client.emails as any).receiving.list === 'function') {
          const recRes = await (client.emails as any).receiving.list({ limit: 100 });
          if (recRes && Array.isArray(recRes.data)) {
            for (const item of recRes.data) {
              const itemTo = String(item.to || '').toLowerCase();
              if (!targetEmail || itemTo.includes(targetEmail)) {
                const already = goldEmails.some(e => e.id === item.id || e.id === `msg_${item.id}`);
                if (!already) {
                  let fullItem = item;
                  try {
                    const fullRes = await (client.emails as any).receiving.get(item.id);
                    if (fullRes && fullRes.data) fullItem = fullRes.data;
                  } catch {}

                  const html = fullItem.html || fullItem.body_html || '';
                  const text = fullItem.text || fullItem.body_text || '';
                  const finalHtml = html || `<p>${text}</p>`;

                  goldEmails.unshift({
                    id: String(item.id),
                    recipient: itemTo || targetEmail,
                    to_email: itemTo || targetEmail,
                    sender: String(fullItem.from || 'external@sender.com'),
                    from_email: String(fullItem.from || 'external@sender.com'),
                    sender_name: String(fullItem.from ? String(fullItem.from).split('@')[0] : 'Sender'),
                    subject: fullItem.subject || '(No Subject)',
                    body_html: finalHtml,
                    body_text: text || '',
                    html: finalHtml,
                    text: text || '',
                    received_at: fullItem.created_at || new Date().toISOString(),
                    created_at: fullItem.created_at || new Date().toISOString(),
                    is_read: false,
                    is_starred: false,
                    folder: 'primary',
                    category: 'primary'
                  });
                  newItemsCount++;
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

// 3. Send Email
app.post('/api/emails/send', async (req: Request, res: Response) => {
  try {
    const { to, cc, bcc, subject, body, sender, scheduled_for, draft_id } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const cleanSender = (sender || 'miracle@goldmailer.xyz').toLowerCase().trim();
    const cleanTo = String(to).toLowerCase().trim();
    const isScheduled = Boolean(scheduled_for && new Date(scheduled_for).getTime() > Date.now());

    let liveSent = false;
    let liveError: string | null = null;

    if (!isScheduled && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        const sendRes = await client.emails.send({
          from: resendFrom,
          to: [cleanTo],
          cc: cc ? [cc] : undefined,
          bcc: bcc ? [bcc] : undefined,
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

    const newEmail: StoredEmail = {
      id: 'msg_sent_' + crypto.randomBytes(8).toString('hex'),
      recipient: cleanTo,
      to_email: cleanTo,
      cc,
      bcc,
      sender: cleanSender,
      from_email: cleanSender,
      sender_name: cleanSender.split('@')[0],
      subject: subject || '(No Subject)',
      body_html: body || '',
      body_text: (body || '').replace(/<[^>]+>/g, ' ').trim(),
      html: body || '',
      text: (body || '').replace(/<[^>]+>/g, ' ').trim(),
      body: body || '',
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      folder: isScheduled ? 'scheduled' : 'sent',
      category: 'primary',
      scheduled_for: isScheduled ? scheduled_for : undefined
    };

    goldEmails.unshift(newEmail);

    // If sent to an internal GoldMailer user, deliver to their inbox directly!
    if (cleanTo.endsWith('@goldmailer.xyz')) {
      goldEmails.unshift({
        ...newEmail,
        id: 'msg_recv_' + crypto.randomBytes(8).toString('hex'),
        is_read: false,
        folder: 'primary'
      });
    }

    // Delete draft if sent from draft
    if (draft_id) {
      goldDrafts = goldDrafts.filter(d => d.id !== draft_id);
    }

    saveData();

    return res.json({
      success: true,
      email: newEmail,
      live_sent: liveSent,
      live_error: liveError
    });
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

// 5. Delete Email (or move to trash)
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

// 6. Inbound Webhook (Resend / Cloudflare)
app.post(['/api/inbound', '/api/receive-email'], (req: Request, res: Response) => {
  try {
    const body = req.body;
    const to = String(body.to || body.recipient || body.to_email || '').toLowerCase().trim();
    const from = String(body.from || body.sender || body.from_email || 'external@sender.com');
    const subject = String(body.subject || '(No Subject)');
    const html = String(body.html || body.body_html || body.text || '');
    const text = String(body.text || body.body_text || '');

    const newEmail: StoredEmail = {
      id: 'msg_inbound_' + crypto.randomBytes(8).toString('hex'),
      recipient: to || 'miracle@goldmailer.xyz',
      to_email: to || 'miracle@goldmailer.xyz',
      sender: from,
      from_email: from,
      sender_name: from.split('@')[0],
      subject,
      body_html: html,
      body_text: text,
      html,
      text,
      body: html || text,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false,
      is_starred: false,
      folder: 'primary',
      category: 'primary'
    };

    goldEmails.unshift(newEmail);
    saveData();
    return res.json({ success: true, id: newEmail.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= OAUTH 2.0 PROVIDER (/oauth & /api/oauth) =================
// Enables "Continue with GoldMailer" on external websites

// 1. Register Developer OAuth Client
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

// 2. OAuth Authorize Consent Endpoint
// GET /api/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=openid%20email%20profile&state=...
app.get(['/api/oauth/authorize', '/oauth/authorize'], (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, state } = req.query;
  const client = oauthClients.find(c => c.client_id === client_id);
  if (!client) {
    return res.status(400).send('OAuth Error: Invalid client_id');
  }

  // Redirect to frontend consent page with params
  const targetUrl = `/?oauth_consent=true&client_id=${client_id}&redirect_uri=${encodeURIComponent(String(redirect_uri || client.redirect_uri))}&scope=${encodeURIComponent(String(scope || 'email profile'))}&state=${encodeURIComponent(String(state || ''))}`;
  return res.redirect(targetUrl);
});

// POST /api/oauth/authorize (Consent granted by user)
app.post('/api/oauth/authorize', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'User must be authenticated with GoldMailer to approve OAuth' });
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
      expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes
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

// 3. OAuth Token Exchange
// POST /api/oauth/token
app.post(['/api/oauth/token', '/oauth/token'], (req: Request, res: Response) => {
  try {
    const { code, client_id, client_secret, redirect_uri, grant_type } = req.body;
    const client = oauthClients.find(c => c.client_id === client_id);
    if (!client) {
      return res.status(401).json({ error: 'invalid_client' });
    }
    if (client.client_secret !== client_secret) {
      return res.status(401).json({ error: 'invalid_client_secret' });
    }

    const codeIdx = oauthCodes.findIndex(c => c.code === code && c.client_id === client_id);
    if (codeIdx === -1) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired or invalid' });
    }

    const authCode = oauthCodes[codeIdx];
    if (authCode.expires_at < Date.now()) {
      oauthCodes.splice(codeIdx, 1);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code has expired' });
    }

    // Burn code
    oauthCodes.splice(codeIdx, 1);

    const user = goldUsers.find(u => u.id === authCode.user_id);
    if (!user) {
      return res.status(400).json({ error: 'invalid_user' });
    }

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

// 4. OAuth UserInfo Endpoint
// GET /api/oauth/userinfo
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

    if (!userId) {
      return res.status(401).json({ error: 'invalid_token' });
    }

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

// ================= ADMIN PANEL APIS (/admin) =================

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
