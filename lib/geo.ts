import { UAParser } from 'ua-parser-js';

// Cache for IP geo lookups to prevent rate limiting
const geoCache = new Map<string, { city: string; country: string }>();

/**
 * Requirement 1: Real IP detection
 * function getRealIP(req){
 *   const f = req.headers.get('x-forwarded-for');
 *   if(f) return f.split(',')[0].trim();
 *   return req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
 * }
 * Don't use x-real-ip or req.ip. Use getRealIP(req) in login, security, sessions.
 */
export function getRealIP(req: any): string {
  if (!req) return 'unknown';

  let forwarded: string | null = null;
  let vercelForwarded: string | null = null;

  if (req.headers && typeof req.headers.get === 'function') {
    forwarded = req.headers.get('x-forwarded-for');
    vercelForwarded = req.headers.get('x-vercel-forwarded-for');
  } else if (req.headers && typeof req.headers === 'object') {
    forwarded = (req.headers['x-forwarded-for'] as string) || null;
    vercelForwarded = (req.headers['x-vercel-forwarded-for'] as string) || null;
  }

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (vercelForwarded) {
    return vercelForwarded.split(',')[0].trim();
  }
  return 'unknown';
}

// Keep getClientIP as an alias for getRealIP for backward compatibility
export const getClientIP = getRealIP;

export function isPrivateIP(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith('fc00:') ||
    ip.startsWith('fe80:')
  );
}

export async function getLocation(ip: string): Promise<string> {
  if (isPrivateIP(ip)) {
    return 'Local device';
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) return 'Local device';
    const data = await res.json();
    return data.city || data.country_name || 'Local device';
  } catch {
    return 'Local device';
  }
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
  const parser = new UAParser(userAgent);
  const UA = parser.getResult();
  const browser = UA.browser.name || 'Browser';
  const os = UA.os.name ? `${UA.os.name}${UA.os.version ? ' ' + UA.os.version : ''}` : 'Unknown OS';
  const device = `${browser} on ${os}`;

  let city = 'Local device';
  let country = 'Local device';

  if (geoCache.has(ip)) {
    const cached = geoCache.get(ip)!;
    city = cached.city;
    country = cached.country;
  } else if (isPrivateIP(ip)) {
    city = 'Local device';
    country = 'Local device';
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
          city = geo.city || 'Local device';
          country = geo.country_name || 'Local device';
          geoCache.set(ip, { city, country });
        }
      }
    } catch {
      city = 'Local device';
      country = 'Local device';
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
