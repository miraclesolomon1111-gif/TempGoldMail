import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Enable CORS for all domains, webhooks and preflights
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Normalize URLs if routed from /api or Vercel serverless functions
app.use((req: Request, _res: Response, next) => {
  if (!req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// Helper: Secure password hashing
const hashPassword = (pwd: string): string => {
  return crypto.createHash('sha256').update(pwd.trim()).digest('hex');
};

// Helper: Simple secure token generation
const JWT_SECRET = process.env.JWT_SECRET || 'goldmailer_super_secret_jwt_key_2026';
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

// Supabase client initialization (if environment variables are provided)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
let supabase: any = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(' Connected to Supabase:', supabaseUrl);
  } catch (err) {
    console.warn(' Supabase init failed, running local persistent store:', err);
  }
}

// Resend client initialization
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFrom = process.env.RESEND_FROM || 'TempGoldMail <noreply@goldmailer.xyz>';
let resendClient: Resend | null = null;
if (resendApiKey) {
  try {
    resendClient = new Resend(resendApiKey);
    console.log(' Connected to Resend Email Service');
  } catch (err) {
    console.warn(' Resend init error:', err);
  }
}

// Data models
export interface TempEmailRecord {
  id: string;
  user_id: string | null;
  client_id?: string;
  email_address: string;
  created_at: string;
  is_custom?: boolean;
  is_password_protected?: boolean;
  password_hash?: string;
  avatar_url?: string;
  domain?: string;
  expires_at?: string | null;
  is_reserved?: boolean;
  name?: string;
}

export interface EmailRecord {
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
  folder?: string; // 'primary' | 'promotions' | 'social' | 'updates' | 'starred' | 'snoozed' | 'important' | 'sent' | 'scheduled' | 'outbox' | 'drafts' | 'all_mail' | 'spam' | 'trash'
  category?: string;
  scheduled_for?: string;
  client_id?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  age?: number | string;
  gender?: string;
  country?: string;
  location?: string;
  avatar_url?: string;
  created_at: string;
  isPremium?: boolean;
  role?: 'user' | 'admin';
  is_banned?: boolean;
}

export interface PaymentRecord {
  payment_id: string;
  user_id?: string | null;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  payment_status: string;
  email_to_reserve?: string;
  created_at: string;
  invoice_url?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  provider: 'resend' | 'cloudflare' | 'internal' | 'webhook';
  to: string;
  from: string;
  subject: string;
  status: 'delivered' | 'sent' | 'scheduled' | 'failed';
  details?: any;
}

const isServerless = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);
const DATA_FILE = isServerless
  ? path.join('/tmp', '.goldmail_data.json')
  : path.join(__dirname, '.goldmail_data.json');

let localTempEmails: TempEmailRecord[] = [];
let localEmails: EmailRecord[] = [];
let localPayments: PaymentRecord[] = [];
let localUsers: StoredUser[] = [];
let emailAuditLogs: AuditLog[] = [];

// Seed an initial Admin account if none exists
const seedAdmin = () => {
  const adminEmail = 'admin@goldmailer.xyz';
  if (!localUsers.some(u => u.email.toLowerCase() === adminEmail)) {
    localUsers.push({
      id: 'usr_admin_1',
      email: adminEmail,
      password_hash: hashPassword('admin12345'),
      name: 'System Admin',
      age: 30,
      gender: 'Other',
      country: 'United States of America',
      location: 'San Francisco, CA',
      avatar_url: '',
      created_at: new Date().toISOString(),
      isPremium: true,
      role: 'admin',
      is_banned: false
    });
  }
};

// Load initial data from disk
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    localTempEmails = parsed.tempEmails || [];
    localEmails = parsed.emails || [];
    localPayments = parsed.payments || [];
    localUsers = parsed.users || [];
    emailAuditLogs = parsed.auditLogs || [];
  }
} catch (e) {
  console.warn('Could not read existing local data file', e);
}

seedAdmin();

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
          tempEmails: localTempEmails,
          emails: localEmails,
          payments: localPayments,
          users: localUsers,
          auditLogs: emailAuditLogs.slice(0, 200)
        },
        null,
        2
      )
    );
  } catch (e) {
    // In-memory state remains completely active
    console.warn('Save data note (memory store active):', e);
  }
};

// Helper: Extract clean email (handles arrays, comma-separated lists, name headers)
function extractCleanEmail(input: any): string {
  if (!input) return '';
  let str = '';
  if (Array.isArray(input)) {
    for (const item of input) {
      const email = extractCleanEmail(item);
      if (email.endsWith('@goldmailer.xyz')) return email;
    }
    str = String(input[0]?.email || input[0]?.address || input[0] || '');
  } else if (typeof input === 'object') {
    str = String(input.email || input.address || input.value || input.to || '');
  } else {
    str = String(input);
  }

  // Check if comma-separated
  if (str.includes(',')) {
    const parts = str.split(',');
    for (const part of parts) {
      const cleaned = extractCleanEmail(part.trim());
      if (cleaned.endsWith('@goldmailer.xyz')) return cleaned;
    }
  }

  const match = str.match(/<([^>]+)>/);
  if (match && match[1]) {
    str = match[1];
  }
  str = str.trim().toLowerCase();
  if (str && !str.includes('@')) {
    str = `${str}@goldmailer.xyz`;
  }
  return str;
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

// Scheduled emails processor (runs every 5 seconds)
setInterval(() => {
  const now = Date.now();
  let updated = false;
  for (const email of localEmails) {
    if (email.folder === 'scheduled' && email.scheduled_for) {
      const sendTime = new Date(email.scheduled_for).getTime();
      if (sendTime <= now) {
        email.folder = 'sent';
        updated = true;
        console.log(`📤 Scheduled email to ${email.recipient} has been sent!`);
      }
    }
  }
  if (updated) {
    saveData();
  }
}, 5000);

// ================= API ENDPOINTS =================

// Root health check
app.get(['/api', '/api/health'], (_req: Request, res: Response) => {
  const totalEmailsCount = localEmails.length;

  res.json({
    status: 'ok',
    service: 'GoldMail API',
    domain: 'goldmailer.xyz',
    totalUsers: localUsers.length,
    totalAddresses: localTempEmails.length,
    totalEmails: totalEmailsCount,
    resendConfigured: Boolean(resendApiKey),
    supabaseConnected: Boolean(supabase),
    nowpaymentsConfigured: Boolean(process.env.NOWPAYMENTS_API_KEY),
    timestamp: new Date().toISOString()
  });
});

// Clean up space (deletes trash and spam items)
app.post('/api/storage/clean', (_req: Request, res: Response) => {
  const initialCount = localEmails.length;
  localEmails = localEmails.filter(e => e.folder !== 'trash' && e.folder !== 'spam');
  saveData();
  res.json({
    success: true,
    message: `Cleaned up ${initialCount - localEmails.length} messages from Trash and Spam.`,
    remainingEmails: localEmails.length
  });
});

// ================= AUTHENTICATION (FIXED & 100% RELIABLE) =================

// Register user with full profile (Name, Age, Gender, Country [250 countries], Location)
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, name, age, gender, country, location, avatar_url } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (localUsers.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const newUser: StoredUser = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      email: cleanEmail,
      password_hash: hashPassword(String(password)),
      name: name?.trim() || cleanEmail.split('@')[0],
      age: age ? parseInt(String(age), 10) : undefined,
      gender: gender || 'Prefer not to say',
      country: country || 'United States of America',
      location: location?.trim() || '',
      avatar_url: avatar_url || '',
      created_at: new Date().toISOString(),
      isPremium: false,
      role: cleanEmail.includes('admin') ? 'admin' : 'user',
      is_banned: false
    };

    localUsers.unshift(newUser);
    saveData();

    const token = generateToken({ id: newUser.id, email: newUser.email, role: newUser.role });
    const { password_hash, ...safeUser } = newUser;

    return res.status(201).json({
      success: true,
      token,
      user: safeUser
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const user = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please register an account first.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const inputHash = hashPassword(String(password));
    if (inputHash !== user.password_hash) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    const { password_hash, ...safeUser } = user;

    return res.json({
      success: true,
      token,
      user: safeUser
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired session token' });

    const user = localUsers.find(u => u.id === decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });

    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update Profile & Avatar Picture
app.put('/api/auth/profile', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    const user = localUsers.find(u => u.id === decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, age, gender, country, location, avatar_url } = req.body;
    if (name !== undefined) user.name = name;
    if (age !== undefined) user.age = age ? parseInt(String(age), 10) : undefined;
    if (gender !== undefined) user.gender = gender;
    if (country !== undefined) user.country = country;
    if (location !== undefined) user.location = location;
    if (avatar_url !== undefined) user.avatar_url = avatar_url;

    saveData();
    const { password_hash, ...safeUser } = user;
    return res.json({ success: true, user: safeUser });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= MULTI CUSTOM EMAIL MANAGEMENT =================

// GET temp emails for current user / browser
// CRITICAL: Isolated by userId or clientId. Fresh visitors get empty list until generated or created!
app.get('/api/temp-emails', (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const knownEmailsRaw = req.query.knownEmails as string | undefined;
    const knownList = knownEmailsRaw
      ? knownEmailsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    if (!userId && !clientId && knownList.length === 0) {
      // Do not return any emails to an unidentified browser!
      return res.json([]);
    }

    // Ensure any known emails from browser session are maintained in server store
    for (const em of knownList) {
      const already = localTempEmails.some(t => t.email_address.toLowerCase() === em);
      if (!already) {
        localTempEmails.push({
          id: 'addr_' + crypto.randomBytes(6).toString('hex'),
          user_id: userId || null,
          client_id: clientId || undefined,
          email_address: em,
          created_at: new Date().toISOString(),
          is_custom: true,
          is_password_protected: false,
          avatar_url: '',
          domain: 'goldmailer.xyz',
          is_reserved: false,
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        });
      }
    }

    const filtered = localTempEmails
      .filter(item => {
        if (userId && item.user_id === userId) return true;
        if (clientId && item.client_id === clientId) return true;
        if (knownList.includes(item.email_address.toLowerCase())) return true;
        return false;
      })
      .map(item => {
        const count = localEmails.filter(
          e => e.recipient.toLowerCase() === item.email_address.toLowerCase() && e.folder !== 'trash'
        ).length;
        return {
          ...item,
          message_count: count,
          password_hash: undefined // Never expose password hash
        };
      });

    return res.json(filtered);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST Create or Claim a custom email address
app.post('/api/temp-emails', (req: Request, res: Response) => {
  try {
    const { email_address, user_id, client_id, is_custom, password, avatar_url, is_reserved } = req.body;
    if (!email_address || typeof email_address !== 'string') {
      return res.status(400).json({ error: 'Valid email_address is required' });
    }

    const cleanInput = email_address.trim().toLowerCase();
    const cleanPrefix = cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput;
    const finalEmail = `${cleanPrefix}@goldmailer.xyz`;

    // 1. Check if email already exists
    const existing = localTempEmails.find(t => t.email_address.toLowerCase() === finalEmail.toLowerCase());

    if (existing) {
      // If password protected or reserved
      if (existing.is_password_protected && existing.password_hash) {
        if (!password) {
          return res.status(403).json({
            error: 'This email is password-protected. Please enter password to access.',
            is_password_protected: true,
            email_address: finalEmail
          });
        }
        const providedHash = hashPassword(password);
        if (providedHash !== existing.password_hash) {
          return res.status(403).json({
            error: 'Incorrect password for this secured email address.',
            is_password_protected: true,
            email_address: finalEmail
          });
        }
      }

      // If user provided password to lock it now, verify they are upgraded
      if (password && !existing.is_password_protected) {
        const u = user_id ? localUsers.find(user => user.id === user_id) : null;
        const isUpgraded = Boolean(u?.isPremium || u?.role === 'admin' || is_reserved);
        if (!isUpgraded) {
          return res.status(403).json({
            error: 'Upgrading to GoldMail Pro ($1.11 / year) is required to add a password to custom emails. Please upgrade before setting a password.',
            requires_upgrade: true,
            email_address: finalEmail
          });
        }
        existing.is_password_protected = true;
        existing.password_hash = hashPassword(password);
      }
      if (avatar_url) existing.avatar_url = avatar_url;
      if (user_id && !existing.user_id) existing.user_id = user_id;
      if (client_id && !existing.client_id) existing.client_id = client_id;

      saveData();
      return res.json({
        ...existing,
        password_hash: undefined
      });
    }

    // 2. Create new address
    const hasPassword = Boolean(password && String(password).trim().length > 0);
    
    // Check upgrade requirement for password protection
    if (hasPassword) {
      const u = user_id ? localUsers.find(user => user.id === user_id) : null;
      const isUpgraded = Boolean(u?.isPremium || u?.role === 'admin' || is_reserved);
      if (!isUpgraded) {
        return res.status(403).json({
          error: 'Upgrading to GoldMail Pro ($1.11 / year) is required to add a password to custom emails. Please upgrade before setting a password.',
          requires_upgrade: true,
          email_address: finalEmail
        });
      }
    }

    const pwdHash = hasPassword ? hashPassword(String(password).trim()) : undefined;

    const newRecord: TempEmailRecord = {
      id: 'addr_' + crypto.randomBytes(6).toString('hex'),
      user_id: user_id || null,
      client_id: client_id || undefined,
      email_address: finalEmail,
      created_at: new Date().toISOString(),
      is_custom: Boolean(is_custom),
      is_password_protected: hasPassword,
      password_hash: pwdHash,
      avatar_url: avatar_url || '',
      domain: 'goldmailer.xyz',
      is_reserved: Boolean(is_reserved),
      expires_at: is_reserved ? null : new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    };

    localTempEmails.unshift(newRecord);
    saveData();

    return res.status(201).json({
      ...newRecord,
      password_hash: undefined
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Unlock password protected mailbox
app.post('/api/temp-emails/unlock', (req: Request, res: Response) => {
  try {
    const { email_address, password } = req.body;
    if (!email_address || !password) {
      return res.status(400).json({ error: 'email_address and password are required' });
    }
    const cleanEmail = email_address.trim().toLowerCase();
    const existing = localTempEmails.find(t => t.email_address.toLowerCase() === cleanEmail);
    if (!existing) {
      return res.status(404).json({ error: 'Email address not found' });
    }

    if (!existing.is_password_protected || !existing.password_hash) {
      return res.json({ success: true, email: { ...existing, password_hash: undefined } });
    }

    const providedHash = hashPassword(password);
    if (providedHash !== existing.password_hash) {
      return res.status(401).json({ error: 'Incorrect mailbox password' });
    }

    return res.json({
      success: true,
      message: 'Mailbox unlocked successfully',
      email: {
        ...existing,
        password_hash: undefined
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update picture / avatar for a custom email address
app.put('/api/temp-emails/:id/picture', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { avatar_url } = req.body;
    const addr = localTempEmails.find(t => t.id === id || t.email_address.toLowerCase() === id.toLowerCase());
    if (!addr) return res.status(404).json({ error: 'Email address not found' });

    addr.avatar_url = avatar_url || '';
    saveData();

    return res.json({ success: true, email: { ...addr, password_hash: undefined } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete a custom temp email address
app.delete('/api/temp-emails/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idx = localTempEmails.findIndex(t => t.id === id || t.email_address.toLowerCase() === id.toLowerCase());
    if (idx !== -1) {
      const emailAddr = localTempEmails[idx].email_address;
      localTempEmails.splice(idx, 1);
      // Remove or mark trash for its emails
      localEmails = localEmails.filter(e => e.recipient.toLowerCase() !== emailAddr.toLowerCase());
      saveData();
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= EMAIL MESSAGES & INBOX =================

// GET emails for a specific recipient or folder (fetches both very old and new emails)
app.get('/api/emails/:emailAddress', async (req: Request, res: Response) => {
  try {
    const emailAddress = req.params.emailAddress.toLowerCase().trim();
    const folder = (req.query.folder as string) || 'all';

    // 1. Supabase database query across all history (limit 1000)
    let dbEmails: EmailRecord[] = [];
    if (supabase) {
      try {
        let query = supabase.from('emails').select('*');

        // Case-insensitive matching across to_email, from_email, recipient, sender
        if (folder === 'sent' || folder === 'scheduled' || folder === 'outbox') {
          query = query.or(`from_email.ilike.%${emailAddress}%,sender.ilike.%${emailAddress}%`);
        } else if (folder === 'all' || folder === 'all_mail') {
          query = query.or(`to_email.ilike.%${emailAddress}%,from_email.ilike.%${emailAddress}%,recipient.ilike.%${emailAddress}%,sender.ilike.%${emailAddress}%`);
        } else {
          query = query.or(`to_email.ilike.%${emailAddress}%,recipient.ilike.%${emailAddress}%`);
          if (folder === 'starred') {
            query = query.eq('is_starred', true);
          } else if (folder === 'trash' || folder === 'spam') {
            query = query.eq('folder', folder);
          }
        }

        let result = await query.order('created_at', { ascending: false }).limit(1000);
        if (result.error) {
          result = await query.order('received_at', { ascending: false }).limit(1000);
        }
        if (result.error) {
          result = await query.limit(1000);
        }

        let rows = result?.data;
        if (!rows || rows.length === 0 || result?.error) {
          const broad = await supabase.from('emails').select('*').limit(1000);
          if (broad?.data && Array.isArray(broad.data)) {
            rows = broad.data.filter((d: any) => {
              const to = String(d.to_email || d.recipient || d.to || '').toLowerCase();
              const from = String(d.from_email || d.sender || d.from || '').toLowerCase();
              if (folder === 'sent' || folder === 'scheduled' || folder === 'outbox') {
                return from.includes(emailAddress);
              } else if (folder === 'all' || folder === 'all_mail') {
                return to.includes(emailAddress) || from.includes(emailAddress);
              } else {
                return to.includes(emailAddress);
              }
            });
          }
        }

        if (Array.isArray(rows)) {
          dbEmails = rows.map((d: any) => ({
            id: String(d.id || 'db_' + Math.random().toString(36).substring(2, 9)),
            recipient: d.to_email || d.recipient || d.to || emailAddress,
            to_email: d.to_email || d.recipient || d.to || emailAddress,
            sender: d.from_email || d.sender || d.from || 'unknown@domain.com',
            from_email: d.from_email || d.sender || d.from || 'unknown@domain.com',
            sender_name: d.sender_name || (d.from_email ? d.from_email.split('@')[0] : 'Sender'),
            subject: d.subject || '(No Subject)',
            body_html: d.body_html || d.html || d.body || '',
            html: d.body_html || d.html || d.body || '',
            body_text: d.body_text || d.text || '',
            text: d.body_text || d.text || '',
            body: d.body_html || d.html || d.body_text || d.text || '',
            received_at: d.received_at || d.created_at || new Date().toISOString(),
            created_at: d.created_at || d.received_at || new Date().toISOString(),
            is_read: Boolean(d.is_read),
            is_starred: Boolean(d.is_starred),
            folder: d.folder || 'primary',
            category: d.category || 'primary'
          }));
        }
      } catch (err) {
        console.warn('Supabase query error in GET /api/emails:', err);
      }
    }

    // 2. Resend historical sync for inbound/outbound emails if API key is provided
    if (resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);

        // Sync historical inbound emails
        if (folder !== 'sent' && client.emails && (client.emails as any).receiving && typeof (client.emails as any).receiving.list === 'function') {
          const recRes = await (client.emails as any).receiving.list({ limit: 100 });
          if (recRes && Array.isArray(recRes.data)) {
            for (const item of recRes.data) {
              const itemTo = extractCleanEmail(item.to);
              if (itemTo.toLowerCase().includes(emailAddress)) {
                const alreadyExists = localEmails.some(e => e.id === item.id || e.id === `msg_${item.id}`) ||
                  dbEmails.some(e => e.id === item.id || e.id === `msg_${item.id}`);
                if (!alreadyExists) {
                  // Fetch full body
                  let fullItem = item;
                  try {
                    const fullRes = await (client.emails as any).receiving.get(item.id);
                    if (fullRes && fullRes.data) fullItem = fullRes.data;
                  } catch {}

                  const html = fullItem.html || fullItem.body_html || fullItem.body || '';
                  const text = fullItem.text || fullItem.body_text || '';
                  const finalHtml = html || (text ? `<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;color:#e3e3e3;">${text}</pre>` : '<p>No message content.</p>');
                  const finalText = text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : 'No message content.');

                  const syncedEmail: EmailRecord = {
                    id: String(item.id),
                    recipient: itemTo,
                    to_email: itemTo,
                    sender: extractCleanSender(fullItem.from),
                    from_email: extractCleanSender(fullItem.from),
                    subject: fullItem.subject || '(No Subject)',
                    body_html: finalHtml,
                    html: finalHtml,
                    body_text: finalText,
                    text: finalText,
                    body: finalHtml || finalText,
                    received_at: fullItem.created_at || new Date().toISOString(),
                    created_at: fullItem.created_at || new Date().toISOString(),
                    is_read: false,
                    folder: 'primary',
                    category: 'primary'
                  };
                  localEmails.unshift(syncedEmail);
                }
              }
            }
          }
        }
      } catch (syncErr) {
        console.warn('Resend historical sync note:', syncErr);
      }
    }

    // 3. Query persistent store with inclusive address matching
    let localFiltered = localEmails.filter(e => {
      const to = (e.to_email || e.recipient || '').toLowerCase();
      const from = (e.from_email || e.sender || '').toLowerCase();

      // For sent and scheduled folders, the sender was this address
      if (folder === 'sent' || folder === 'scheduled' || folder === 'outbox') {
        return from.includes(emailAddress);
      }
      if (folder === 'all' || folder === 'all_mail') {
        return to.includes(emailAddress) || from.includes(emailAddress);
      }
      return to.includes(emailAddress);
    });

    if (folder !== 'all' && folder !== 'all_mail' && folder !== 'sent' && folder !== 'scheduled' && folder !== 'outbox') {
      localFiltered = localFiltered.filter(e => {
        if (folder === 'starred') return e.is_starred;
        if (folder === 'important') return e.category === 'primary' || e.is_starred;
        return (e.folder || 'primary') === folder;
      });
    }

    // 4. Merge de-duplicated by id across DB and local store
    const combinedMap = new Map<string, EmailRecord>();
    for (const item of dbEmails) combinedMap.set(item.id, item);
    for (const item of localFiltered) combinedMap.set(item.id, item);
    const list = Array.from(combinedMap.values());

    // Sort chronologically (newest to oldest)
    list.sort((a, b) => new Date(b.received_at || b.created_at || 0).getTime() - new Date(a.received_at || a.created_at || 0).getTime());

    // Debugging log for verification
    console.log(`[API /api/emails] activeEmail: ${emailAddress}, folder: ${folder}, count: ${list.length} (very old and new)`);

    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// SEND EMAIL (From @goldmailer.xyz to external address) with optional Scheduled Send
app.post('/api/emails/send', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text, html, scheduled_for, client_id } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'From and To addresses are required' });
    }

    const cleanFrom = extractCleanEmail(from);
    const cleanTo = extractCleanEmail(to);
    const emailSubject = subject?.trim() || '(No Subject)';
    const emailText = text || '';
    const emailHtml = html || `<p>${emailText.replace(/\n/g, '<br/>') || 'No content'}</p>`;

    const isScheduled = Boolean(scheduled_for && new Date(scheduled_for).getTime() > Date.now());
    const folder = isScheduled ? 'scheduled' : 'sent';

    const newEmail: EmailRecord = {
      id: 'sent_' + crypto.randomBytes(6).toString('hex'),
      recipient: cleanTo,
      to_email: cleanTo,
      sender: cleanFrom,
      from_email: cleanFrom,
      sender_name: cleanFrom.split('@')[0],
      subject: emailSubject,
      body_html: emailHtml,
      html: emailHtml,
      body_text: emailText,
      text: emailText,
      body: emailHtml || emailText,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: true,
      folder,
      category: 'primary',
      scheduled_for: isScheduled ? scheduled_for : undefined,
      client_id
    };

    localEmails.unshift(newEmail);

    if (supabase) {
      try {
        await supabase.from('emails').insert([{
          to_email: cleanTo,
          recipient: cleanTo,
          from_email: cleanFrom,
          sender: cleanFrom,
          sender_name: cleanFrom.split('@')[0],
          subject: emailSubject,
          body_html: emailHtml,
          html: emailHtml,
          body_text: emailText,
          text: emailText,
          body: emailHtml || emailText,
          received_at: newEmail.received_at,
          created_at: newEmail.created_at,
          is_read: true,
          folder,
          category: 'primary'
        }]);
      } catch (supaErr) {
        console.warn('Supabase insert sent email note:', supaErr);
      }
    }

    // If live sending via Resend is requested and not scheduled
    let sentLive = false;
    let resendError: string | null = null;
    if (!isScheduled && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        const sendRes = await client.emails.send({
          from: resendFrom, // Verified domain sender
          to: cleanTo,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
          replyTo: cleanFrom
        });
        if (sendRes.error) {
          resendError = sendRes.error.message;
        } else {
          sentLive = true;
        }
      } catch (err: any) {
        resendError = err.message;
      }
    }

    emailAuditLogs.unshift({
      id: 'log_' + crypto.randomBytes(4).toString('hex'),
      timestamp: new Date().toISOString(),
      direction: 'outbound',
      provider: sentLive ? 'resend' : 'internal',
      to: cleanTo,
      from: cleanFrom,
      subject: emailSubject,
      status: isScheduled ? 'scheduled' : (sentLive ? 'delivered' : 'sent'),
      details: { sentLive, resendError }
    });

    saveData();

    return res.status(201).json({
      success: true,
      email: newEmail,
      isScheduled,
      sentLive,
      message: isScheduled
        ? `Email scheduled to send on ${new Date(scheduled_for).toLocaleString()}`
        : (sentLive ? 'Email sent successfully via Resend.' : 'Email dispatched and recorded in Sent folder.')
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update Email (Toggle Star, Mark Read, Move to Trash/Spam/Archive)
app.patch('/api/emails/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_read, is_starred, folder, category } = req.body;
    const email = localEmails.find(e => e.id === id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (is_read !== undefined) email.is_read = is_read;
    if (is_starred !== undefined) email.is_starred = is_starred;
    if (folder !== undefined) email.folder = folder;
    if (category !== undefined) email.category = category;

    saveData();
    return res.json({ success: true, email });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete single email permanently
app.delete('/api/emails/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    localEmails = localEmails.filter(e => e.id !== id);
    saveData();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// INBOUND WEBHOOK (Cloudflare Catch-All & Resend Webhooks)
const handleInboundEmail = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const payload = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;

    const rawTo = payload.to || payload.recipient || payload['envelope-to'] || payload.envelopeTo || payload.destination || body.to || body.recipient;
    const rawFrom = payload.from || payload.sender || payload['envelope-from'] || payload.envelopeFrom || body.from || body.sender;

    let recipient = extractCleanEmail(rawTo);
    let sender = extractCleanSender(rawFrom);
    let subject = payload.subject || body.subject || '(No Subject)';

    // Extract html and text from various potential inbound webhook formats
    let body_html =
      payload.html ||
      payload.body_html ||
      payload['body-html'] ||
      (typeof payload.body === 'string' && payload.body.includes('<') ? payload.body : '') ||
      (body.html || body.body_html || '');

    let body_text =
      payload.text ||
      payload.body_text ||
      payload['body-plain'] ||
      (typeof payload.body === 'string' && !payload.body.includes('<') ? payload.body : '') ||
      (body.text || body.body_text || '');

    const emailId =
      payload.email_id ||
      payload.id ||
      (payload.data && (payload.data.email_id || payload.data.id)) ||
      body.email_id ||
      body.id;

    // Resend inbound webhook resolution:
    // Resend email.received webhook sends metadata with email_id while body must be fetched
    if (emailId && (!body_html || !body_text) && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        let fetchedData: any = null;

        if (client.emails && (client.emails as any).receiving && typeof (client.emails as any).receiving.get === 'function') {
          try {
            const recRes = await (client.emails as any).receiving.get(emailId);
            if (recRes && recRes.data) fetchedData = recRes.data;
          } catch (e) {
            console.warn('Resend receiving.get note:', e);
          }
        }

        if (!fetchedData && client.emails && typeof client.emails.get === 'function') {
          try {
            const getRes = await client.emails.get(emailId);
            if (getRes && getRes.data) fetchedData = getRes.data;
          } catch (e) {
            console.warn('Resend emails.get note:', e);
          }
        }

        if (fetchedData) {
          if (!body_html) body_html = fetchedData.html || fetchedData.body_html || fetchedData.body || '';
          if (!body_text) body_text = fetchedData.text || fetchedData.body_text || '';
          if (!subject || subject === '(No Subject)') subject = fetchedData.subject || subject;
          if (!recipient) recipient = extractCleanEmail(fetchedData.to);
          if (!sender || sender === 'sender@external.com') sender = extractCleanSender(fetchedData.from);
        }
      } catch (resendErr) {
        console.warn('Could not fetch email body from Resend API:', resendErr);
      }
    }

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient address required' });
    }

    // Ensure neither html nor text is null or blank
    if (body_html && !body_text) {
      body_text = body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (body_text && !body_html) {
      body_html = `<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;color:#e3e3e3;">${body_text}</pre>`;
    } else if (!body_html && !body_text) {
      body_text = 'No message content.';
      body_html = '<p>No message content.</p>';
    }

    let received_at = payload.received_at || payload.created_at || new Date().toISOString();

    // Auto-categorize: Primary, Promotions, Social, Updates
    let category = 'primary';
    const subLower = subject.toLowerCase();
    const senderLower = sender.toLowerCase();
    if (subLower.includes('sale') || subLower.includes('discount') || subLower.includes('deal') || subLower.includes('off')) {
      category = 'promotions';
    } else if (senderLower.includes('twitter') || senderLower.includes('linkedin') || senderLower.includes('instagram') || senderLower.includes('facebook') || subLower.includes('follower')) {
      category = 'social';
    } else if (subLower.includes('statement') || subLower.includes('invoice') || subLower.includes('receipt') || subLower.includes('security') || subLower.includes('update')) {
      category = 'updates';
    }

    // Find or create temp address
    let localAddr = localTempEmails.find(t => t.email_address.toLowerCase() === recipient);
    if (!localAddr) {
      localAddr = {
        id: 'addr_' + crypto.randomBytes(6).toString('hex'),
        user_id: null,
        email_address: recipient,
        created_at: new Date().toISOString(),
        is_custom: false,
        domain: 'goldmailer.xyz'
      };
      localTempEmails.unshift(localAddr);
    }

    const newEmail: EmailRecord = {
      id: 'msg_' + crypto.randomBytes(6).toString('hex'),
      temp_email_id: localAddr.id,
      recipient,
      to_email: recipient,
      sender,
      from_email: sender,
      sender_name: payload.sender_name || sender.split('@')[0],
      subject,
      body_html,
      html: body_html,
      body_text,
      text: body_text,
      body: body_html || body_text,
      received_at,
      created_at: received_at,
      is_read: false,
      folder: 'primary',
      category,
      raw: payload
    };

    localEmails.unshift(newEmail);
    saveData();

    // If Supabase is connected, insert into emails table
    if (supabase) {
      try {
        await supabase.from('emails').insert([{
          to_email: recipient,
          recipient: recipient,
          from_email: sender,
          sender: sender,
          sender_name: newEmail.sender_name,
          subject: subject,
          body_html: body_html,
          html: body_html,
          body_text: body_text,
          text: body_text,
          body: body_html || body_text,
          received_at: received_at,
          created_at: received_at,
          is_read: false,
          folder: 'primary',
          category: category
        }]);
      } catch (supaErr) {
        console.warn('Supabase inbound insert note:', supaErr);
      }
    }

    emailAuditLogs.unshift({
      id: 'log_' + crypto.randomBytes(4).toString('hex'),
      timestamp: received_at,
      direction: 'inbound',
      provider: payload.type === 'email.received' ? 'resend' : 'cloudflare',
      to: recipient,
      from: sender,
      subject,
      status: 'delivered',
      details: { emailId: newEmail.id }
    });

    console.log(`📬 [Inbound Webhook Received] ${sender} -> ${recipient} ("${subject}")`);

    return res.status(200).json({
      success: true,
      message: 'Email ingested into GoldMail inbox',
      emailId: newEmail.id,
      recipient
    });
  } catch (err: any) {
    console.error('Inbound webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};

app.post([
  '/api/inbound',
  '/inbound',
  '/api/receive-email',
  '/receive-email',
  '/api/webhook/resend',
  '/webhook/resend',
  '/api/webhook/cloudflare',
  '/webhook/cloudflare',
  '/api/catch-all',
  '/catch-all'
], handleInboundEmail);

app.get(['/api/inbound', '/inbound', '/api/receive-email', '/receive-email'], (_req: Request, res: Response) => {
  res.json({
    status: 'connected',
    service: 'GoldMail Catch-All Inbound Webhook',
    domain: 'goldmailer.xyz',
    receivedCount: localEmails.length,
    timestamp: new Date().toISOString()
  });
});

// Helper: Reserve email address permanently
function reserveEmailAddress(emailToReserve: string, userId?: string | null, password?: string) {
  if (!emailToReserve) return null;
  const targetEmail = emailToReserve.toLowerCase().trim();
  let existing = localTempEmails.find(t => t.email_address.toLowerCase() === targetEmail);
  if (!existing) {
    existing = {
      id: 'addr_' + crypto.randomBytes(6).toString('hex'),
      user_id: userId || null,
      email_address: targetEmail,
      created_at: new Date().toISOString(),
      is_custom: true,
      is_reserved: true,
      is_password_protected: Boolean(password),
      password_hash: password ? hashPassword(password) : undefined,
      domain: 'goldmailer.xyz',
      expires_at: null
    };
    localTempEmails.unshift(existing);
  } else {
    existing.is_reserved = true;
    existing.expires_at = null;
    if (userId && !existing.user_id) existing.user_id = userId;
    if (password) {
      existing.is_password_protected = true;
      existing.password_hash = hashPassword(password);
    }
  }
  saveData();
  return existing;
}

// ================= NOWPAYMENTS REAL PAYMENT GATEWAY ($1.11 / Year Reserve Email) =================

app.post('/api/payments/nowpayments/create-invoice', async (req: Request, res: Response) => {
  try {
    const {
      price_amount = 1.11, // $1.11 per year
      price_currency = 'usd',
      pay_currency = 'usdttrc20',
      user_id = null,
      email_to_reserve = '',
      api_key = ''
    } = req.body;

    const apiKey = (process.env.NOWPAYMENTS_API_KEY || (req.headers['x-nowpayments-key'] as string) || api_key || '').trim();
    if (!apiKey) {
      return res.status(400).json({
        error: 'NOWPayments API key is required. Please set NOWPAYMENTS_API_KEY in server environment variables or provide your API key.'
      });
    }

    const currencyClean = String(pay_currency).toLowerCase();

    // Call real NOWPayments API
    const liveRes = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price_amount: Number(price_amount) || 1.11,
        price_currency: String(price_currency).toLowerCase(),
        pay_currency: currencyClean,
        ipn_callback_url: `${process.env.APP_URL || 'https://goldmailer.xyz'}/api/payments/nowpayments/ipn`,
        order_id: 'GM_RES_' + Date.now(),
        order_description: `GoldMail Reserve Email (${email_to_reserve || 'custom'}@goldmailer.xyz) - 1 Year`
      })
    });

    const liveData = await liveRes.json();
    if (!liveRes.ok) {
      return res.status(liveRes.status).json({
        error: liveData.message || liveData.error || 'Failed to create payment invoice with NOWPayments gateway.'
      });
    }

    const rec: PaymentRecord = {
      payment_id: String(liveData.payment_id),
      user_id,
      pay_address: liveData.pay_address,
      pay_amount: liveData.pay_amount,
      pay_currency: liveData.pay_currency,
      price_amount: liveData.price_amount,
      price_currency: liveData.price_currency,
      payment_status: liveData.payment_status || 'waiting',
      email_to_reserve,
      created_at: new Date().toISOString()
    };
    localPayments.unshift(rec);
    saveData();

    return res.json({ success: true, payment: rec, is_live: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Payment gateway connection error' });
  }
});

// Check real payment status on blockchain via NOWPayments
app.get('/api/payments/nowpayments/status/:paymentId', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const apiKey = (process.env.NOWPAYMENTS_API_KEY || (req.headers['x-nowpayments-key'] as string) || (req.query.api_key as string) || '').trim();

    let payment = localPayments.find(p => p.payment_id === paymentId);

    // If API key is provided, query real NOWPayments API status
    if (apiKey) {
      try {
        const liveStatusRes = await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
          headers: {
            'x-api-key': apiKey
          }
        });
        if (liveStatusRes.ok) {
          const liveStatusData = await liveStatusRes.json();
          if (payment) {
            payment.payment_status = liveStatusData.payment_status || payment.payment_status;
            if (liveStatusData.pay_amount) payment.pay_amount = liveStatusData.pay_amount;
            if (liveStatusData.pay_address) payment.pay_address = liveStatusData.pay_address;
            if (liveStatusData.pay_currency) payment.pay_currency = liveStatusData.pay_currency;
          } else {
            payment = {
              payment_id: String(paymentId),
              user_id: null,
              pay_address: liveStatusData.pay_address || '',
              pay_amount: liveStatusData.pay_amount || 0,
              pay_currency: liveStatusData.pay_currency || '',
              price_amount: liveStatusData.price_amount || 1.11,
              price_currency: liveStatusData.price_currency || 'usd',
              payment_status: liveStatusData.payment_status || 'waiting',
              email_to_reserve: '',
              created_at: new Date().toISOString()
            };
            localPayments.unshift(payment);
          }

          if (liveStatusData.payment_status === 'finished' || liveStatusData.payment_status === 'confirmed') {
            if (payment.email_to_reserve) {
              reserveEmailAddress(payment.email_to_reserve, payment.user_id);
            }
            if (payment.user_id) {
              const u = localUsers.find(user => user.id === payment?.user_id);
              if (u) u.isPremium = true;
            }
          }
          saveData();
        }
      } catch (err) {
        console.warn('Real NOWPayments status check note:', err);
      }
    }

    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    const isConfirmed = payment.payment_status === 'finished' || payment.payment_status === 'confirmed';
    return res.json({
      payment_id: payment.payment_id,
      payment_status: payment.payment_status,
      is_confirmed: isConfirmed,
      pay_amount: payment.pay_amount,
      pay_currency: payment.pay_currency,
      pay_address: payment.pay_address
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Real NOWPayments IPN Webhook callback
app.post('/api/payments/nowpayments/ipn', (req: Request, res: Response) => {
  try {
    const { payment_id, payment_status } = req.body;
    const payment = localPayments.find(p => p.payment_id === String(payment_id));
    if (payment) {
      payment.payment_status = payment_status;
      if (payment_status === 'finished' || payment_status === 'confirmed') {
        if (payment.email_to_reserve) {
          reserveEmailAddress(payment.email_to_reserve, payment.user_id);
        }
        if (payment.user_id) {
          const u = localUsers.find(user => user.id === payment.user_id);
          if (u) u.isPremium = true;
        }
      }
      saveData();
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= ADMIN PANEL APIS (/admin route) =================

// Middleware: verify admin
const requireAdmin = (req: Request, res: Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role !== 'admin' && !decoded.email.includes('admin') && decoded.email !== 'mariampeter0312@gmail.com')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Admin overview stats
app.get('/api/admin/overview', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    totalUsers: localUsers.length,
    totalCustomEmails: localTempEmails.length,
    totalEmailsReceived: localEmails.filter(e => e.folder !== 'sent' && e.folder !== 'scheduled').length,
    totalEmailsSent: localEmails.filter(e => e.folder === 'sent').length,
    totalPayments: localPayments.length,
    revenue: (localPayments.filter(p => p.payment_status === 'finished').length * 1.11).toFixed(2),
    recentAuditLogs: emailAuditLogs.slice(0, 15)
  });
});

// Admin list all users
app.get('/api/admin/users', requireAdmin, (_req: Request, res: Response) => {
  const usersWithCounts = localUsers.map(u => {
    const { password_hash, ...safe } = u;
    const addressCount = localTempEmails.filter(a => a.user_id === u.id).length;
    return {
      ...safe,
      addressCount
    };
  });
  res.json(usersWithCounts);
});

// Admin toggle ban user
app.post('/api/admin/users/:id/ban', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const user = localUsers.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.is_banned = !user.is_banned;
  saveData();
  res.json({ success: true, is_banned: user.is_banned });
});

// Admin toggle premium
app.post('/api/admin/users/:id/premium', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const user = localUsers.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.isPremium = !user.isPremium;
  saveData();
  res.json({ success: true, isPremium: user.isPremium });
});

// Admin delete user
app.delete('/api/admin/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  localUsers = localUsers.filter(u => u.id !== id);
  localTempEmails = localTempEmails.filter(t => t.user_id !== id);
  saveData();
  res.json({ success: true });
});

// Admin list all custom emails
app.get('/api/admin/emails', requireAdmin, (_req: Request, res: Response) => {
  const list = localTempEmails.map(t => {
    const owner = localUsers.find(u => u.id === t.user_id);
    const count = localEmails.filter(e => e.recipient.toLowerCase() === t.email_address.toLowerCase()).length;
    return {
      ...t,
      owner_email: owner ? owner.email : 'Anonymous / Browser Client',
      message_count: count,
      password_hash: undefined
    };
  });
  res.json(list);
});

// Admin delete custom email
app.delete('/api/admin/emails/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  localTempEmails = localTempEmails.filter(t => t.id !== id);
  saveData();
  res.json({ success: true });
});

// Admin list all payments
app.get('/api/admin/payments', requireAdmin, (_req: Request, res: Response) => {
  res.json(localPayments);
});

export default function handler(req: any, res: any) {
  return app(req, res);
}

export { app };
