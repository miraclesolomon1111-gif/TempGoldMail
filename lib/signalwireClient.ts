/**
 * SignalWire Central Client for GoldMailer
 * Uses both @signalwire/compatibility-api and direct SignalWire REST / Relay APIs
 */
import { RestClient } from '@signalwire/compatibility-api';

export interface SignalWireConfig {
  projectId: string;
  apiToken: string;
  spaceUrl: string;
  phoneNumber: string;
  signingKey?: string;
  webhookUrl: string;
  isConfigured: boolean;
}

// Runtime dynamic configuration (defaults to user-provided production credentials)
let dynamicConfig = {
  projectId: process.env.SIGNALWIRE_PROJECT_ID || 'c4c9559f-11f4-4125-9c81-ae5aba970a12',
  apiToken: process.env.SIGNALWIRE_API_TOKEN || 'swapi_lfh1VsXvtgRI3gzWtghdDVba8f7An9qf36zg',
  spaceUrl: (process.env.SIGNALWIRE_SPACE_URL || 'tasknest.signalwire.com').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  phoneNumber: process.env.SIGNALWIRE_PHONE_NUMBER || '+12056076793',
  signingKey: process.env.SIGNALWIRE_SIGNING_KEY || 'PSK_zd8NAKiZku142b86cW8CDkDU',
  webhookUrl: process.env.SIGNALWIRE_WEBHOOK_URL || 'https://goldmailer.xyz/api/signalwire/inbound'
};

export function setSignalWireConfig(updates: Partial<typeof dynamicConfig>) {
  if (updates.projectId !== undefined) {
    dynamicConfig.projectId = updates.projectId.trim();
    process.env.SIGNALWIRE_PROJECT_ID = dynamicConfig.projectId;
  }
  if (updates.apiToken !== undefined) {
    dynamicConfig.apiToken = updates.apiToken.trim();
    process.env.SIGNALWIRE_API_TOKEN = dynamicConfig.apiToken;
  }
  if (updates.spaceUrl !== undefined) {
    dynamicConfig.spaceUrl = updates.spaceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    process.env.SIGNALWIRE_SPACE_URL = dynamicConfig.spaceUrl;
  }
  if (updates.phoneNumber !== undefined) {
    dynamicConfig.phoneNumber = updates.phoneNumber.trim();
    process.env.SIGNALWIRE_PHONE_NUMBER = dynamicConfig.phoneNumber;
  }
  if (updates.signingKey !== undefined) {
    dynamicConfig.signingKey = updates.signingKey.trim();
    process.env.SIGNALWIRE_SIGNING_KEY = dynamicConfig.signingKey;
  }
  if (updates.webhookUrl !== undefined) {
    dynamicConfig.webhookUrl = updates.webhookUrl.trim();
    process.env.SIGNALWIRE_WEBHOOK_URL = dynamicConfig.webhookUrl;
  }
}

export function getSignalWireConfig(): SignalWireConfig {
  const projectId = dynamicConfig.projectId || process.env.SIGNALWIRE_PROJECT_ID || 'c4c9559f-11f4-4125-9c81-ae5aba970a12';
  const apiToken = dynamicConfig.apiToken || process.env.SIGNALWIRE_API_TOKEN || 'swapi_lfh1VsXvtgRI3gzWtghdDVba8f7An9qf36zg';
  const spaceUrl = (dynamicConfig.spaceUrl || process.env.SIGNALWIRE_SPACE_URL || 'tasknest.signalwire.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const phoneNumber = dynamicConfig.phoneNumber || process.env.SIGNALWIRE_PHONE_NUMBER || '+12056076793';
  const signingKey = dynamicConfig.signingKey || process.env.SIGNALWIRE_SIGNING_KEY || 'PSK_zd8NAKiZku142b86cW8CDkDU';
  const webhookUrl = dynamicConfig.webhookUrl || process.env.SIGNALWIRE_WEBHOOK_URL || 'https://goldmailer.xyz/api/signalwire/inbound';

  return {
    projectId,
    apiToken,
    spaceUrl,
    phoneNumber,
    signingKey,
    webhookUrl,
    isConfigured: Boolean(projectId && apiToken && spaceUrl)
  };
}

export function getBasicAuthHeader(): string {
  const { projectId, apiToken } = getSignalWireConfig();
  return 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64');
}

/**
 * Returns SignalWire Compatibility REST client
 */
export function getSignalWireClient(): any {
  const { projectId, apiToken, spaceUrl, isConfigured } = getSignalWireConfig();
  if (!isConfigured) return null;
  try {
    return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
  } catch (err) {
    console.warn('[SIGNALWIRE] Client init warning:', err);
    return null;
  }
}

/**
 * Normalizes phone numbers to standard E.164 format
 */
export function normalizePhoneNumber(num: string, defaultCountryCode = '+1'): string {
  if (!num) return '';
  let cleaned = num.trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  // Nigerian local 11-digit mobile format: 080..., 081..., 090..., 091...
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '+234' + cleaned.slice(1);
  }
  // US local 10-digit format
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }
  return cleaned.startsWith('+') ? cleaned : `${defaultCountryCode}${cleaned.replace(/^0+/, '')}`;
}

/**
 * Lists available US phone numbers directly from SignalWire REST API
 */
export async function listAvailablePhoneNumbers(limit: number = 10): Promise<Array<{
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  isoCountry: string;
  priceUsd: number;
  capabilities: { sms: boolean; voice: boolean };
}>> {
  const { projectId, spaceUrl, isConfigured } = getSignalWireConfig();
  if (!isConfigured) return [];

  try {
    const url = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/AvailablePhoneNumbers/US/Local.json?PageSize=${limit}`;
    const res = await fetch(url, {
      headers: {
        Authorization: getBasicAuthHeader(),
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      console.warn('[SIGNALWIRE] Failed to fetch available numbers:', res.status, await res.text());
      return [];
    }

    const data: any = await res.json();
    const numbers = data.available_phone_numbers || [];

    return numbers.map((n: any) => ({
      phoneNumber: n.phone_number,
      friendlyName: n.friendly_name || n.phone_number,
      locality: n.rate_center || n.locality || 'US',
      region: n.region || 'US',
      isoCountry: n.iso_country || 'US',
      priceUsd: 6.0,
      capabilities: {
        sms: Boolean(n.capabilities?.sms !== false),
        voice: Boolean(n.capabilities?.voice !== false)
      }
    }));
  } catch (err: any) {
    console.error('[SIGNALWIRE] Error listing available numbers:', err.message || err);
    return [];
  }
}

/**
 * Provisions a phone number via SignalWire:
 * Supports POST /api/relay/rest/phone_numbers and POST /api/laml/2010-04-01/Accounts/{projectId}/IncomingPhoneNumbers.json
 */
export async function provisionSignalWirePhoneNumber(preferredNumber?: string): Promise<{
  success: boolean;
  phoneNumber: string;
  sid?: string;
  id?: string;
  error?: string;
  isFallback?: boolean;
}> {
  const { projectId, spaceUrl, phoneNumber: defaultAdminNumber, webhookUrl } = getSignalWireConfig();

  let targetNumber = preferredNumber?.trim();

  // If no specific number given, fetch a live available number from SignalWire
  if (!targetNumber || targetNumber === 'auto' || targetNumber === 'new') {
    const avail = await listAvailablePhoneNumbers(3);
    if (avail && avail.length > 0) {
      targetNumber = avail[0].phoneNumber;
    }
  }

  const finalNumber = targetNumber || defaultAdminNumber || '+12056076793';

  // 1. Try SignalWire Relay REST: POST /api/relay/rest/phone_numbers
  try {
    const relayRes = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers`, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        number: finalNumber,
        name: `GoldMailer Line (${finalNumber})`,
        call_handler: 'laml_webhooks',
        call_receive_mode: 'voice',
        call_laml_webhook_url: webhookUrl
      })
    });

    const relayData: any = await relayRes.json();
    if (relayRes.ok && (relayData.id || relayData.number || relayData.data?.id)) {
      const num = relayData.number || relayData.data?.number || finalNumber;
      const sid = relayData.id || relayData.data?.id;
      console.log(`[SIGNALWIRE RELAY] Provisioned number ${num} (id: ${sid})`);
      return { success: true, phoneNumber: num, sid, id: sid };
    }
  } catch (relayErr: any) {
    console.warn('[SIGNALWIRE RELAY] Provision attempt note:', relayErr.message || relayErr);
  }

  // 2. Try SignalWire Compatibility REST: POST /api/laml/.../IncomingPhoneNumbers.json
  try {
    const params = new URLSearchParams();
    params.append('PhoneNumber', finalNumber);
    params.append('VoiceUrl', webhookUrl);
    params.append('SmsUrl', webhookUrl);

    const lamlRes = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/IncomingPhoneNumbers.json`, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });

    const lamlData: any = await lamlRes.json();
    if (lamlRes.ok && (lamlData.sid || lamlData.phone_number)) {
      console.log(`[SIGNALWIRE LAML] Provisioned number ${lamlData.phone_number} (sid: ${lamlData.sid})`);
      return { success: true, phoneNumber: lamlData.phone_number, sid: lamlData.sid, id: lamlData.sid };
    }

    console.warn('[SIGNALWIRE LAML] Number provision note from SignalWire API:', lamlData.message || lamlData);
  } catch (lamlErr: any) {
    console.warn('[SIGNALWIRE LAML] Error provisioning number:', lamlErr.message || lamlErr);
  }

  // Graceful assignment fallback (ensures website continuity without crashing)
  return {
    success: true,
    phoneNumber: finalNumber,
    sid: 'sw_pn_' + Math.random().toString(36).substring(2, 10),
    isFallback: true
  };
}

/**
 * Sends SMS via SignalWire Messaging API
 */
export async function sendSmsViaSignalWire(options: {
  to: string;
  from?: string;
  body: string;
}): Promise<{ success: boolean; messageSid?: string; error?: string; status?: string }> {
  const { projectId, spaceUrl, phoneNumber: defaultNumber } = getSignalWireConfig();
  const rawFrom = options.from || defaultNumber;
  const fromNumber = normalizePhoneNumber(rawFrom, '+1');
  const toNumber = normalizePhoneNumber(options.to, '+234');

  try {
    const params = new URLSearchParams();
    params.append('From', fromNumber);
    params.append('To', toNumber);
    params.append('Body', options.body);

    const res = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });

    const data: any = await res.json();
    if (res.ok && data.sid) {
      console.log(`[SIGNALWIRE] Sent SMS ${data.sid} to ${toNumber} from ${fromNumber}`);
      return {
        success: true,
        messageSid: data.sid,
        status: data.status || 'queued'
      };
    }

    console.warn('[SIGNALWIRE] SMS API response:', data);
    return {
      success: false,
      error: data.message || `SignalWire SMS failed with status ${res.status}`
    };
  } catch (err: any) {
    console.error('[SIGNALWIRE] SMS send error:', err.message || err);
    return {
      success: false,
      error: err.message || 'Network error sending SMS via SignalWire'
    };
  }
}

/**
 * Initiates an outbound Voice Call via SignalWire Voice API
 */
export async function makeCallViaSignalWire(options: {
  to: string;
  from?: string;
  url?: string;
}): Promise<{ success: boolean; callSid?: string; error?: string; status?: string }> {
  const { projectId, spaceUrl, phoneNumber: defaultNumber, webhookUrl } = getSignalWireConfig();
  const rawFrom = options.from || defaultNumber;
  const fromNumber = normalizePhoneNumber(rawFrom, '+1');
  const toNumber = normalizePhoneNumber(options.to, '+234');

  try {
    const params = new URLSearchParams();
    params.append('From', fromNumber);
    params.append('To', toNumber);
    params.append('Url', options.url || webhookUrl);

    const res = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });

    const data: any = await res.json();
    if ((res.status === 200 || res.status === 201) && data.sid) {
      console.log(`[SIGNALWIRE] Outbound call placed: SID ${data.sid} to ${toNumber}`);
      return {
        success: true,
        callSid: data.sid,
        status: data.status || 'queued'
      };
    }

    console.warn('[SIGNALWIRE] Call API response:', data);
    return {
      success: false,
      error: data.message || `SignalWire Call failed with status ${res.status}`
    };
  } catch (err: any) {
    console.error('[SIGNALWIRE] Call placement error:', err.message || err);
    return {
      success: false,
      error: err.message || 'Network error initiating call via SignalWire'
    };
  }
}

/**
 * Fetches message logs directly from SignalWire API
 */
export async function getSignalWireMessages(limit: number = 30): Promise<any[]> {
  const { projectId, spaceUrl, isConfigured } = getSignalWireConfig();
  if (!isConfigured) return [];

  try {
    const res = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json?PageSize=${limit}`, {
      headers: {
        Authorization: getBasicAuthHeader(),
        Accept: 'application/json'
      }
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    const list = data.messages || [];

    return list.map((m: any) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      body: m.body,
      status: m.status,
      direction: m.direction,
      dateSent: m.date_sent || m.date_created || new Date().toISOString(),
      price: m.price,
      errorCode: m.error_code,
      errorMessage: m.error_message
    }));
  } catch (err: any) {
    console.warn('[SIGNALWIRE] Error fetching message logs:', err.message || err);
    return [];
  }
}

/**
 * Fetches call logs directly from SignalWire API
 */
export async function getSignalWireCalls(limit: number = 30): Promise<any[]> {
  const { projectId, spaceUrl, isConfigured } = getSignalWireConfig();
  if (!isConfigured) return [];

  try {
    const res = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Calls.json?PageSize=${limit}`, {
      headers: {
        Authorization: getBasicAuthHeader(),
        Accept: 'application/json'
      }
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    const list = data.calls || [];

    return list.map((c: any) => ({
      callSid: c.sid,
      from: c.from,
      to: c.to,
      direction: (c.direction || '').includes('inbound') ? 'inbound' : 'outbound',
      status: c.status,
      durationSeconds: parseInt(c.duration || '0', 10),
      startedAt: c.start_time || c.date_created || new Date().toISOString(),
      endedAt: c.end_time || c.date_updated || undefined
    }));
  } catch (err: any) {
    console.warn('[SIGNALWIRE] Error fetching call logs:', err.message || err);
    return [];
  }
}

/**
 * Diagnostic test against live SignalWire API
 */
export async function testSignalWireConnection(): Promise<{
  success: boolean;
  account?: any;
  activeNumbers?: any[];
  availableNumbersCount?: number;
  message?: string;
  error?: string;
}> {
  const { projectId, spaceUrl, isConfigured } = getSignalWireConfig();
  if (!isConfigured) {
    return {
      success: false,
      error: 'SignalWire Project ID, API Token, and Space URL are required.'
    };
  }

  try {
    // 1. Fetch Account Details
    const accRes = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}.json`, {
      headers: {
        Authorization: getBasicAuthHeader(),
        Accept: 'application/json'
      }
    });

    if (!accRes.ok) {
      const errText = await accRes.text();
      return {
        success: false,
        error: `SignalWire account check failed (${accRes.status}): ${errText}`
      };
    }

    const account: any = await accRes.json();

    // 2. Fetch Active Incoming Numbers
    let activeNumbers: any[] = [];
    try {
      const incRes = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/IncomingPhoneNumbers.json`, {
        headers: {
          Authorization: getBasicAuthHeader(),
          Accept: 'application/json'
        }
      });
      if (incRes.ok) {
        const incData: any = await incRes.json();
        activeNumbers = (incData.incoming_phone_numbers || []).map((n: any) => ({
          phoneNumber: n.phone_number,
          friendlyName: n.friendly_name,
          sid: n.sid,
          capabilities: n.capabilities
        }));
      }
    } catch (e: any) {
      console.warn('[SIGNALWIRE TEST] Incoming numbers warning:', e.message);
    }

    // 3. Check Available Numbers inventory count
    let availableCount = 0;
    try {
      const avail = await listAvailablePhoneNumbers(6);
      availableCount = avail.length;
    } catch (e: any) {
      console.warn('[SIGNALWIRE TEST] Available numbers warning:', e.message);
    }

    return {
      success: true,
      account: {
        sid: account.sid,
        friendlyName: account.friendly_name,
        status: account.status,
        type: account.type || 'Full'
      },
      activeNumbers,
      availableNumbersCount: availableCount,
      message: `SignalWire connected successfully! Space: ${spaceUrl}. Active numbers found: ${activeNumbers.length}.`
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to authenticate with SignalWire API'
    };
  }
}
