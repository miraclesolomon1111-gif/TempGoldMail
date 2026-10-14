import 'dotenv/config';
import { testTelnyxConnection, listAvailablePhoneNumbers, getTelnyxConfig } from './lib/telnyxClient.ts';

async function runTestSuite() {
  console.log('🧪 Starting Full Test Suite for Telnyx Live Flow, Manual Renewal & eSIM...');

  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  let passedCount = 0;
  let totalTests = 10;

  async function post(path: string, body: any, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
  }

  async function get(path: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers
    });
  }

  try {
    // 1. TELNYX LIVE FLOW TEST
    console.log('\n--- TEST 1: Telnyx Live Flow & Real Data Verification ---');
    const config = getTelnyxConfig();
    console.log(`Telnyx API Key configured: ${Boolean(config.apiKey)}`);
    console.log(`Telnyx Phone: ${config.phoneNumber}`);

    const conn = await testTelnyxConnection();
    console.log(`Telnyx connection result: success=${conn.success}, message="${conn.message || ''}"`);
    if (!conn.success) {
      throw new Error(`Telnyx connection failed: ${conn.error || conn.message}`);
    }
    console.log('✅ [PASS] 1.1 Telnyx live connection authenticated successfully.');
    passedCount++;

    const availableNumbers = await listAvailablePhoneNumbers(5);
    console.log(`Fetched ${availableNumbers.length} real numbers from Telnyx inventory.`);
    if (!availableNumbers || availableNumbers.length === 0) {
      throw new Error('Telnyx failed to return available phone numbers');
    }
    console.log('✅ [PASS] 1.2 Live numbers successfully queried from Telnyx REST API.');
    passedCount++;

    console.log(`\n🎉 Telnyx core live tests completed: ${passedCount}/2 passed.`);
  } catch (err: any) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTestSuite();
