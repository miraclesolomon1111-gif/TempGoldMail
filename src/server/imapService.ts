import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';

export interface ImapConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface FetchedImapEmail {
  id: string;
  messageId?: string;
  recipient: string;
  to_email: string;
  to: string;
  cc?: string;
  bcc?: string;
  sender: string;
  from_email: string;
  from: string;
  sender_name: string;
  subject: string;
  body_html: string;
  body_text: string;
  html: string;
  text: string;
  body: string;
  received_at: string;
  created_at: string;
  is_read: boolean;
  is_starred: boolean;
  folder: string;
  category: 'primary' | 'promotions' | 'social' | 'updates';
  raw?: any;
}

/**
 * Extract clean email address from string, array, or object
 */
export function extractCleanAddress(input: any): string {
  if (!input) return '';
  if (Array.isArray(input)) {
    const extracted = input.map(item => extractCleanAddress(item)).filter(Boolean);
    const goldXyz = extracted.find(a => a.endsWith('@goldmailer.xyz'));
    return goldXyz || extracted[0] || '';
  }
  if (typeof input === 'object') {
    return (input.address || input.email || input.text || '').toLowerCase().trim();
  }
  const str = String(input);
  const parts = str.split(/[,;]+/);
  const candidates: string[] = [];
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/) || part.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match && match[1]) {
      candidates.push(match[1].toLowerCase().trim());
    } else if (part.trim()) {
      candidates.push(part.toLowerCase().trim());
    }
  }
  const goldXyz = candidates.find(a => a.endsWith('@goldmailer.xyz'));
  return goldXyz || candidates[0] || '';
}

/**
 * Fetch messages from IMAP server using ImapFlow + mailparser
 */
export async function fetchEmailsFromImap(
  targetEmail: string,
  customConfig?: ImapConfig,
  limit: number = 50
): Promise<FetchedImapEmail[]> {
  const host = customConfig?.host || process.env.IMAP_HOST || process.env.IMAP_SERVER || '';
  const port = customConfig?.port || parseInt(process.env.IMAP_PORT || '993', 10);
  const secure = customConfig?.secure ?? (process.env.IMAP_SECURE !== 'false' && port === 993);
  const user = customConfig?.user || process.env.IMAP_USER || process.env.IMAP_USERNAME || targetEmail;
  const pass = customConfig?.pass || process.env.IMAP_PASS || process.env.IMAP_PASSWORD || '';

  if (!host || !pass) {
    // IMAP not configured via environment or params
    return [];
  }

  console.log(`[IMAP] Connecting to ${host}:${port} as ${user}...`);

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    logger: false,
    emitLogs: false
  });

  const results: FetchedImapEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      const totalMessages = status && typeof status === 'object' && 'messages' in status ? (status.messages || 0) : 0;
      console.log(`[IMAP] Successfully locked INBOX. Total messages available: ${totalMessages}`);
      if (totalMessages === 0) {
        return [];
      }

      // Fetch the last N messages
      const startSeq = Math.max(1, totalMessages - limit + 1);
      const range = `${startSeq}:${totalMessages}`;

      for await (const message of client.fetch(range, { source: true, flags: true, envelope: true })) {
        if (!message.source) continue;
        try {
          const parsed = await simpleParser(message.source);
          const parsedTo = parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to.text)
            : targetEmail;
          const cleanTo = extractCleanAddress(parsedTo) || targetEmail;
          const fromText = parsed.from ? parsed.from.text : 'unknown@sender.com';
          const cleanFrom = extractCleanAddress(fromText);
          const senderName = parsed.from?.value?.[0]?.name || cleanFrom.split('@')[0] || 'Sender';
          const htmlContent = parsed.html || (parsed.text ? `<pre style="font-family:inherit;white-space:pre-wrap;">${parsed.text}</pre>` : '');
          const textContent = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
          const dateIso = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
          const isRead = message.flags ? message.flags.has('\\Seen') : false;
          const isStarred = message.flags ? message.flags.has('\\Flagged') : false;

          const stableMsgId = parsed.messageId || `${cleanFrom}_${cleanTo}_${parsed.subject || ''}_${dateIso}`;
          const hashKey = crypto.createHash('md5').update(stableMsgId).digest('hex').slice(0, 16);
          const imapId = 'msg_imap_' + (message.uid ? `${message.uid}_${hashKey.slice(0, 8)}` : hashKey);

          results.unshift({
            id: imapId,
            messageId: parsed.messageId,
            raw: { messageId: parsed.messageId, uid: message.uid },
            recipient: cleanTo,
            to_email: cleanTo,
            to: cleanTo,
            cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.map(c => c.text).join(', ') : parsed.cc.text) : undefined,
            bcc: parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc.map(b => b.text).join(', ') : parsed.bcc.text) : undefined,
            sender: fromText,
            from_email: cleanFrom,
            from: cleanFrom,
            sender_name: senderName,
            subject: parsed.subject || '(No Subject)',
            body_html: htmlContent,
            body_text: textContent,
            html: htmlContent,
            text: textContent,
            body: htmlContent || textContent,
            received_at: dateIso,
            created_at: dateIso,
            is_read: isRead,
            is_starred: isStarred,
            folder: 'primary',
            category: 'primary'
          });
        } catch (parseErr) {
          console.warn('Failed to parse IMAP message:', parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    console.warn(`IMAP connection note for ${host}:${port} (${user}):`, err.message);
  }

  return results;
}
