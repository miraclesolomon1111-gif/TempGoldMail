import { UAParser } from 'ua-parser-js';

// Cache for IP geo lookups to prevent rate limiting
const geoCache = new Map<string, { city: string; country: string }>();

/**
 * Extracts client IP from request, supporting Next.js (web Request) and Express (IncomingMessage)
 */
export function getClientIP(req: any): string {
  if (!req) return '127.0.0.1';

  let raw = '';

  // 1. Next.js / Web Request (Headers object)
  if (req.headers && typeof req.headers.get === 'function') {
    raw =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      '';
  } else if (req.headers && typeof req.headers === 'object') {
    // 2. Express Request (plain headers object)
    raw =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      (req.headers['cf-connecting-ip'] as string) ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';
  }

  if (!raw) return '127.0.0.1';

  // Extract first IP in comma-separated chain
  let ip = raw.split(',')[0].trim();

  // Normalize IPv6 mapped IPv4 (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1' || ip === 'localhost') {
    ip = '127.0.0.1';
  }

  return ip || '127.0.0.1';
}

/**
 * Extracts User-Agent string from request
 */
export function getClientUserAgent(req: any): string {
  if (!req) return 'Unknown User-Agent';

  if (req.headers && typeof req.headers.get === 'function') {
    return req.headers.get('user-agent') || 'Unknown User-Agent';
  }
  if (req.headers && typeof req.headers === 'object') {
    return (req.headers['user-agent'] as string) || 'Unknown User-Agent';
  }
  return 'Unknown User-Agent';
}

/**
 * Parses user-agent and retrieves location from IP
 */
export async function detectDeviceAndLocation(userAgent: string, ip: string) {
  // Detect device like Gmail does
  const parser = new UAParser(userAgent);
  const UA = parser.getResult();

  const browser = UA.browser.name || 'Browser';
  const os = UA.os.name ? `${UA.os.name}${UA.os.version ? ' ' + UA.os.version : ''}` : 'Unknown OS';
  const device = `${browser} on ${os}`;

  let city = 'Unknown';
  let country = 'Unknown';

  // Check cache first
  if (geoCache.has(ip)) {
    const cached = geoCache.get(ip)!;
    city = cached.city;
    country = cached.country;
  } else if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    city = 'Local Network';
    country = 'Local Device';
    geoCache.set(ip, { city, country });
  } else {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'GoldMailer/1.0' }
      });
      clearTimeout(timeoutId);

      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo && !geo.error) {
          city = geo.city || 'Unknown';
          country = geo.country_name || 'Unknown';
          geoCache.set(ip, { city, country });
        }
      }
    } catch {
      // Fallback silently if offline or blocked
      city = 'Unknown';
      country = 'Unknown';
    }
  }

  return {
    device,
    browser,
    os,
    city,
    country,
    ip,
    userAgent
  };
}
