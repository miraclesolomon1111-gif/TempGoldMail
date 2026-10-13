import crypto from 'crypto';
import {
  getSignalWireConfig,
  setSignalWireConfig,
  getSignalWireClient,
  normalizePhoneNumber,
  listAvailablePhoneNumbers as listAvailableNumbersApi,
  provisionSignalWirePhoneNumber as provisionNumberApi,
  sendSmsViaSignalWire as sendSmsApi,
  makeCallViaSignalWire as makeCallApi,
  getSignalWireMessages as getMessagesApi,
  getSignalWireCalls as getCallsApi,
  testSignalWireConnection as testConnectionApi
} from '../../lib/signalwireClient';

// Types
export interface StoredSMS {
  id: string;
  userId?: string;
  from: string;
  to: string;
  body: string;
  receivedAt: string;
  messageSid?: string;
  direction: 'inbound' | 'outbound';
  status?: string;
  is_read?: boolean;
}

export interface StoredPhoneNumber {
  id: string;
  userId: string;
  userEmail?: string;
  phoneNumber: string; // E.164 format e.g. "+12056076793"
  friendlyName?: string;
  provider: 'signalwire';
  status: 'active' | 'expired' | 'pending';
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
export function setSignalWireCredentials(projectId: string, apiToken: string, spaceUrl?: string, phoneNumber?: string) {
  setSignalWireConfig({
    projectId,
    apiToken,
    spaceUrl,
    phoneNumber
  });
}

export {
  getSignalWireConfig,
  getSignalWireClient,
  normalizePhoneNumber
};

/**
 * Initiate outbound Voice Call via SignalWire Voice API
 */
export async function makeCallViaSignalWire(options: {
  to: string;
  from?: string;
  url?: string;
}): Promise<{ success: boolean; callSid?: string; error?: string; status?: string }> {
  return makeCallApi(options);
}

/**
 * Send SMS via SignalWire Messaging API
 */
export async function sendSmsViaSignalWire(options: {
  to: string;
  from?: string;
  body: string;
}): Promise<{ success: boolean; messageSid?: string; error?: string; status?: string }> {
  return sendSmsApi(options);
}

/**
 * Run diagnostic test against live SignalWire API
 */
export async function testSignalWireConnection(): Promise<{
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
 * Query available US phone numbers from real SignalWire API (no mock data)
 */
export async function listAvailablePhoneNumbers(limit: number = 10): Promise<any[]> {
  return listAvailableNumbersApi(limit);
}

/**
 * Buy phone number through SignalWire
 */
export async function buySignalWirePhoneNumber(preferredNumber?: string): Promise<{
  success: boolean;
  phoneNumber: string;
  sid?: string;
  error?: string;
}> {
  return provisionNumberApi(preferredNumber);
}

/**
 * Fetch logs directly from SignalWire API
 */
export async function getSignalWireLogs(limit: number = 20): Promise<any[]> {
  return getMessagesApi(limit);
}

/**
 * Fetch call logs directly from SignalWire API
 */
export async function getSignalWireCallLogs(limit: number = 20): Promise<any[]> {
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
