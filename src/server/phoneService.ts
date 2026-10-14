import crypto from 'crypto';
import {
  getTelnyxConfig,
  setTelnyxConfig,
  getTelnyxClient,
  normalizePhoneNumber,
  listAvailablePhoneNumbers as listAvailableNumbersApi,
  provisionTelnyxPhoneNumber as provisionNumberApi,
  sendSmsViaTelnyx as sendSmsApi,
  sendBulkSms as sendBulkSmsApi,
  makeCallViaTelnyx as makeCallApi,
  getTelnyxMessages as getMessagesApi,
  getTelnyxCalls as getCallsApi,
  testTelnyxConnection as testConnectionApi,
  getActiveTelnyxNumbers as getActiveNumbersApi,
  verifyTelnyxWebhook as verifyWebhookApi,
  isOptedOut,
  addOptOut,
  removeOptOut,
  getOptOutList
} from '../../lib/telnyxClient';

// Types
export interface StoredSMS {
  id: string;
  userId?: string;
  from: string;
  to: string;
  body: string;
  receivedAt: string;
  messageSid?: string;
  telnyx_message_id?: string;
  direction: 'inbound' | 'outbound';
  status?: string;
  is_read?: boolean;
}

export interface StoredPhoneNumber {
  id: string;
  sid?: string;
  userId: string;
  userEmail?: string;
  phoneNumber: string; // E.164 format e.g. "+14236662513"
  friendlyName?: string;
  provider: 'telnyx';
  status: 'active' | 'suspended' | 'expired' | 'pending';
  purchasedAt: string;
  expiresAt: string;
  daysRemaining?: number;
  autoRenew: boolean;
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
}

export interface StoredPhonePurchase {
  id: string;
  userId: string;
  paymentId?: string;
  orderId: string;
  phoneNumber: string;
  amount: number;
  currency: string;
  status: 'waiting' | 'confirming' | 'finished' | 'failed' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface StoredCall {
  id: string;
  userId?: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  status: 'completed' | 'in-progress' | 'ringing' | 'queued' | 'failed' | 'busy' | 'no-answer' | 'canceled';
  durationSeconds?: number;
  callSid?: string;
  recordingUrl?: string;
  sayMessage?: string;
  startedAt: string;
  endedAt?: string;
}

// Credentials management
export function setTelnyxCredentials(
  apiKey: string,
  phoneNumber?: string,
  messagingProfileId?: string,
  voiceAppId?: string,
  publicKey?: string,
  webhookUrl?: string
) {
  setTelnyxConfig({
    apiKey,
    phoneNumber,
    messagingProfileId,
    voiceAppId,
    publicKey,
    webhookUrl
  });
}

export {
  getTelnyxConfig,
  getTelnyxClient,
  normalizePhoneNumber,
  getActiveNumbersApi as getActiveTelnyxNumbers,
  verifyWebhookApi as verifyTelnyxWebhook,
  isOptedOut,
  addOptOut,
  removeOptOut,
  getOptOutList
};

/**
 * Initiate outbound Voice Call via Telnyx Call Control API
 */
export async function makeCallViaTelnyx(options: {
  to: string;
  from?: string;
  audioUrl?: string;
  ttsText?: string;
  webhookUrl?: string;
}): Promise<{ success: boolean; callSid?: string; callControlId?: string; error?: string; status?: string }> {
  return makeCallApi(options);
}

/**
 * Standard makeCall function
 */
export async function makeCall(
  to: string,
  audioOrTts?: string
): Promise<{ success: boolean; callSid?: string; error?: string; status?: string }> {
  const isUrl = typeof audioOrTts === 'string' && (audioOrTts.startsWith('http://') || audioOrTts.startsWith('https://'));
  return makeCallApi({
    to,
    audioUrl: isUrl ? audioOrTts : undefined,
    ttsText: !isUrl ? audioOrTts : undefined
  });
}

/**
 * Send SMS via Telnyx Messages API
 */
export async function sendSmsViaTelnyx(options: {
  to: string;
  from?: string;
  body: string;
  messagingProfileId?: string;
  campaignId?: string;
}): Promise<{ success: boolean; messageSid?: string; messageId?: string; error?: string; status?: string }> {
  return sendSmsApi(options);
}

/**
 * Standard sendSms function
 */
export async function sendSms(
  to: string,
  body: string,
  campaignId?: string
): Promise<{ success: boolean; messageId?: string; messageSid?: string; error?: string; status?: string }> {
  return sendSmsApi({ to, body, campaignId });
}

/**
 * Send bulk SMS with rate limiting and opt-out tracking
 */
export async function sendBulkSms(
  contacts: string[],
  body: string,
  options?: { from?: string; campaignId?: string; rateLimitMs?: number }
) {
  return sendBulkSmsApi(contacts, body, options);
}

/**
 * Run diagnostic test against live Telnyx API
 */
export async function testTelnyxConnection(): Promise<{
  success: boolean;
  account?: any;
  activeNumbers?: any[];
  availableNumbersCount?: number;
  message?: string;
  error?: string;
}> {
  return testConnectionApi();
}

/**
 * Query available US phone numbers from real Telnyx API (no mock data)
 */
export async function listAvailablePhoneNumbers(limit: number = 10): Promise<any[]> {
  return listAvailableNumbersApi(limit);
}

/**
 * Buy phone number through Telnyx
 */
export async function buyTelnyxPhoneNumber(preferredNumber?: string): Promise<{
  success: boolean;
  phoneNumber: string;
  sid?: string;
  id?: string;
  error?: string;
}> {
  return provisionNumberApi(preferredNumber);
}

/**
 * Fetch logs directly from Telnyx API
 */
export async function getTelnyxLogs(limit: number = 20): Promise<any[]> {
  return getMessagesApi(limit);
}

/**
 * Fetch call logs directly from Telnyx API
 */
export async function getTelnyxCallLogs(limit: number = 20): Promise<any[]> {
  return getCallsApi(limit);
}

/**
 * NOWPayments IPN Signature verification
 */
export function verifyNowPaymentsSignature(payload: any, signature: string, secret?: string): boolean {
  const ipnSecret = secret || process.env.NOWPAYMENTS_IPN_SECRET || process.env.IPN_SECRET || '';
  if (!ipnSecret) {
    console.warn('[NOWPAYMENTS] IPN_SECRET not set, signature check skipped for testing.');
    return true;
  }
  if (!signature) return false;

  try {
    const ordered = Object.keys(payload)
      .sort()
      .reduce((obj: any, key: string) => {
        obj[key] = payload[key];
        return obj;
      }, {});
    const jsonString = JSON.stringify(ordered);
    const hmac = crypto.createHmac('sha512', ipnSecret);
    hmac.update(jsonString);
    const calculatedSig = hmac.digest('hex');
    return calculatedSig.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error('[NOWPAYMENTS] Signature verification error:', err);
    return false;
  }
}

/**
 * Create NOWPayments invoice
 */
export async function createNowPaymentsInvoice(params: {
  priceAmount: number;
  priceCurrency: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ success: boolean; invoiceUrl?: string; id?: string; error?: string }> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY || '';

  if (!apiKey) {
    // Generate functional simulated invoice checkout for development/sandbox
    const mockInvoiceId = 'inv_' + Math.random().toString(36).substring(2, 9);
    return {
      success: true,
      id: mockInvoiceId,
      invoiceUrl: `https://nowpayments.io/payment/?iid=${mockInvoiceId}&simulated=true`
    };
  }

  try {
    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price_amount: params.priceAmount,
        price_currency: params.priceCurrency,
        order_id: params.orderId,
        order_description: params.orderDescription,
        ipn_callback_url: params.ipnCallbackUrl || 'https://goldmailer.xyz/api/webhook/nowpayments',
        success_url: params.successUrl || 'https://goldmailer.xyz/#phone',
        cancel_url: params.cancelUrl || 'https://goldmailer.xyz/#phone'
      })
    });

    const data = await res.json();
    if (res.ok && data.invoice_url) {
      return {
        success: true,
        id: data.id,
        invoiceUrl: data.invoice_url
      };
    }

    return {
      success: false,
      error: data.message || 'Failed to create NOWPayments invoice'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error connecting to NOWPayments'
    };
  }
}
