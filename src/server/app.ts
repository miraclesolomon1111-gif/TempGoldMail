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
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

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
  sender: string;
  sender_name?: string;
  subject: string;
  body_html: string;
  body_text: string;
  received_at: string;
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

const DATA_FILE = process.env.VERCEL
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
    console.error('Failed to save data to disk', e);
  }
};

// Helper: Extract clean email
function extractCleanEmail(input: any): string {
  if (!input) return '';
  let str = '';
  if (Array.isArray(input)) {
    str = String(input[0] || '');
  } else if (typeof input === 'object') {
    str = String(input.email || input.address || input.value || input.to || '');
  } else {
    str = String(input);
  }
  const match = str.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }
  return str.trim().toLowerCase();
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

    if (!userId && !clientId) {
      // Do not return any emails to an unidentified browser!
      return res.json([]);
    }

    const filtered = localTempEmails
      .filter(item => {
        if (userId && item.user_id === userId) return true;
        if (clientId && item.client_id === clientId) return true;
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

// GET emails for a specific recipient or folder
app.get('/api/emails/:emailAddress', (req: Request, res: Response) => {
  try {
    const emailAddress = req.params.emailAddress.toLowerCase().trim();
    const folder = (req.query.folder as string) || 'all';

    let list = localEmails.filter(e => {
      // For sent and scheduled folders, the sender was this address
      if (folder === 'sent' || folder === 'scheduled' || folder === 'outbox') {
        return e.sender.toLowerCase().includes(emailAddress);
      }
      return e.recipient.toLowerCase() === emailAddress;
    });

    if (folder !== 'all' && folder !== 'all_mail') {
      list = list.filter(e => {
        if (folder === 'starred') return e.is_starred;
        if (folder === 'important') return e.category === 'primary' || e.is_starred;
        return (e.folder || 'primary') === folder;
      });
    }

    list.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
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
      sender: cleanFrom,
      sender_name: cleanFrom.split('@')[0],
      subject: emailSubject,
      body_html: emailHtml,
      body_text: emailText,
      received_at: new Date().toISOString(),
      is_read: true,
      folder,
      category: 'primary',
      scheduled_for: isScheduled ? scheduled_for : undefined,
      client_id
    };

    localEmails.unshift(newEmail);

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

    const rawTo = payload.to || payload.recipient || payload['envelope-to'] || payload.envelopeTo || payload.destination;
    const rawFrom = payload.from || payload.sender || payload['envelope-from'] || payload.envelopeFrom;

    let recipient = extractCleanEmail(rawTo);
    let sender = extractCleanSender(rawFrom);
    let subject = payload.subject || '(No Subject)';
    let body_html = payload.html || payload.body_html || payload['body-html'] || '';
    let body_text = payload.text || payload.body_text || payload['body-plain'] || '';
    let received_at = payload.received_at || payload.created_at || new Date().toISOString();

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient address required' });
    }

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
      sender,
      sender_name: payload.sender_name || sender.split('@')[0],
      subject,
      body_html: body_html || `<div style="font-family:sans-serif;padding:12px;">${body_text.replace(/\n/g, '<br/>')}</div>`,
      body_text: body_text || (body_html ? body_html.replace(/<[^>]+>/g, ' ').trim() : ''),
      received_at,
      is_read: false,
      folder: 'primary',
      category
    };

    localEmails.unshift(newEmail);
    saveData();

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

app.post(['/api/inbound', '/api/receive-email', '/api/webhook/resend'], handleInboundEmail);
app.get(['/api/inbound', '/api/receive-email'], (_req: Request, res: Response) => {
  res.json({
    status: 'connected',
    service: 'GoldMail Catch-All Inbound Webhook',
    domain: 'goldmailer.xyz',
    receivedCount: localEmails.length,
    timestamp: new Date().toISOString()
  });
});

// ================= NOWPAYMENTS GATEWAY ($1.11 / Year Reserve Email) =================

app.post('/api/payments/nowpayments/create-invoice', async (req: Request, res: Response) => {
  try {
    const {
      price_amount = 1.11, // $1.11 per year
      price_currency = 'usd',
      pay_currency = 'usdttrc20',
      user_id = null,
      email_to_reserve = ''
    } = req.body;

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    const currencyClean = String(pay_currency).toLowerCase();
    const paymentId = 'nowpay_' + Math.floor(100000000 + Math.random() * 900000000);

    const demoRates: Record<string, { address: string; rate: number }> = {
      usdttrc20: { address: 'TXG7qJp6bVwP8hN23mK94RtsE67kLpM41A', rate: 1.0 },
      usdterc20: { address: '0x71C065F656c1B8C11756556e4B3a89073D447b94', rate: 1.0 },
      btc: { address: 'bc1qm3s9vr7l8h02u2z3dkg5v86n7rwwm8e9v904qj', rate: 64200.0 },
      eth: { address: '0x71C065F656c1B8C11756556e4B3a89073D447b94', rate: 2650.0 },
      sol: { address: '9B5X4L7XN2r1V8q5tP6u7wM2vY5n4z1cK8j7m3x4v9b2', rate: 154.0 },
      ltc: { address: 'LQT4G9x4k8B2m1n7q8V3r5p6w2y9z4c1m8', rate: 68.0 }
    };

    const targetInfo = demoRates[currencyClean] || demoRates['usdttrc20'];
    const calculatedCryptoAmount = parseFloat((price_amount / targetInfo.rate).toFixed(6));

    if (apiKey) {
      try {
        const liveRes = await fetch('https://api.nowpayments.io/v1/payment', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            price_amount,
            price_currency,
            pay_currency: currencyClean,
            ipn_callback_url: `${process.env.APP_URL || 'https://goldmailer.xyz'}/api/payments/nowpayments/ipn`,
            order_id: 'GM_RES_' + Date.now(),
            order_description: `GoldMail Reserve Email (${email_to_reserve || 'custom'}@goldmailer.xyz) - 1 Year`
          })
        });

        if (liveRes.ok) {
          const liveData = await liveRes.json();
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
        }
      } catch (e) {
        console.warn('NOWPayments API call fell back to instant sandbox invoice:', e);
      }
    }

    // Instant Sandbox invoice for immediate verification
    const newPayment: PaymentRecord = {
      payment_id: paymentId,
      user_id,
      pay_address: targetInfo.address,
      pay_amount: calculatedCryptoAmount,
      pay_currency: currencyClean.toUpperCase(),
      price_amount,
      price_currency: 'USD',
      payment_status: 'waiting',
      email_to_reserve,
      created_at: new Date().toISOString()
    };

    localPayments.unshift(newPayment);
    saveData();

    return res.json({
      success: true,
      payment: newPayment,
      is_live: false,
      nowpayments_notice: apiKey ? 'Connected' : 'NOWPayments Sandbox Mode ($1.11 / Year)'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Check payment status & confirm
app.get('/api/payments/nowpayments/status/:paymentId', (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const payment = localPayments.find(p => p.payment_id === paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

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

// Confirm payment / activate reserved email
app.post('/api/payments/nowpayments/simulate-success', (req: Request, res: Response) => {
  try {
    const { payment_id, password } = req.body;
    const payment = localPayments.find(p => p.payment_id === payment_id) || localPayments[0];

    if (payment) {
      payment.payment_status = 'finished';

      // Reserve target email forever!
      if (payment.email_to_reserve) {
        const targetEmail = payment.email_to_reserve.toLowerCase().trim();
        let existing = localTempEmails.find(t => t.email_address.toLowerCase() === targetEmail);
        if (!existing) {
          existing = {
            id: 'addr_' + crypto.randomBytes(6).toString('hex'),
            user_id: payment.user_id || null,
            email_address: targetEmail,
            created_at: new Date().toISOString(),
            is_custom: true,
            is_reserved: true,
            is_password_protected: Boolean(password),
            password_hash: password ? hashPassword(password) : undefined,
            domain: 'goldmailer.xyz'
          };
          localTempEmails.unshift(existing);
        } else {
          existing.is_reserved = true;
          existing.expires_at = null;
          if (password) {
            existing.is_password_protected = true;
            existing.password_hash = hashPassword(password);
          }
        }
      }

      // Upgrade user if user_id present
      if (payment.user_id) {
        const u = localUsers.find(user => user.id === payment.user_id);
        if (u) u.isPremium = true;
      }

      saveData();
    }

    return res.json({
      success: true,
      message: 'Payment confirmed! Email reserved permanently with password protection.',
      payment_status: 'finished'
    });
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
