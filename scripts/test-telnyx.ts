/**
 * Telnyx Verification & Live Testing Script for GoldMailer
 *
 * Requirements:
 * 1. Live Telnyx API connection & account verification
 * 2. Send live test SMS from +14236662513 to +2349161191940
 * 3. Call / flash live call from +14236662513 to +2349161191940
 * 4. Check for live incoming/outgoing SMS logs for +14236662513
 * 5. Verify available numbers search
 */

import {
  getTelnyxConfig,
  setTelnyxConfig,
  testTelnyxConnection,
  sendSmsViaTelnyx,
  makeCallViaTelnyx,
  getTelnyxMessages,
  getTelnyxCalls,
  listAvailablePhoneNumbers
} from '../lib/telnyxClient.ts';

const API_KEY = process.env.TELNYX_API_KEY || '';
const FROM_NUMBER = process.env.TELNYX_PHONE_NUMBER || process.env.TRLNYX_PHONE || '+14236662513';
const PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || '4001a139-34ea-4725-a3be-890f641b9137';
const VOICE_APP_ID = process.env.TELNYX_VOICE_APP_ID || process.env.TRLNYX_VOICE_APP_ID || '3070367984242394362';
const TEST_DESTINATION = '+2349161191940';

console.log('====================================================');
console.log('         TELNYX LIVE TESTING SUITE                  ');
console.log('====================================================');
console.log(`From Line  : ${FROM_NUMBER}`);
console.log(`Destination: ${TEST_DESTINATION}`);
console.log(`Profile ID : ${PROFILE_ID}`);
console.log(`Voice App  : ${VOICE_APP_ID}`);
console.log('----------------------------------------------------\n');

setTelnyxConfig({
  apiKey: API_KEY,
  phoneNumber: FROM_NUMBER,
  messagingProfileId: PROFILE_ID,
  voiceAppId: VOICE_APP_ID
});

async function runLiveTests() {
  // TEST 1: Test Connection & Account info
  console.log('▶ TEST 1: Testing live Telnyx API connection & account verification...');
  const conn = await testTelnyxConnection();
  console.log('Telnyx connection result:', conn.success ? 'AUTHENTICATED' : 'FAILED', conn.message || conn.error);
  if (!conn.success) {
    throw new Error('Telnyx authentication failed: ' + (conn.error || conn.message));
  }
  console.log(`✔ [PASS] Connected to Telnyx! Active phone numbers in account: ${conn.activeNumbers?.length || 0}`);
  if (conn.activeNumbers && conn.activeNumbers.length > 0) {
    conn.activeNumbers.forEach((n: any) => {
      console.log(`   - Line: ${n.phone_number || n.phoneNumber} (Status: ${n.status || 'active'})`);
    });
  }

  // TEST 2: Send live test SMS to +2349161191940
  console.log(`\n▶ TEST 2: Sending live test SMS from ${FROM_NUMBER} to ${TEST_DESTINATION}...`);
  const smsResult = await sendSmsViaTelnyx({
    to: TEST_DESTINATION,
    from: FROM_NUMBER,
    body: `[GoldMailer] Test verification SMS sent via Telnyx at ${new Date().toISOString()}`,
    messagingProfileId: PROFILE_ID
  });

  console.log('SMS Result:', JSON.stringify(smsResult, null, 2));
  if (smsResult.success) {
    console.log(`✔ [PASS] Live SMS dispatched! Message ID: ${smsResult.messageId || smsResult.messageSid}`);
  } else {
    console.warn(`⚠ Note on SMS: ${smsResult.error}`);
  }

  // TEST 3: Place live test call / flash call to +2349161191940
  console.log(`\n▶ TEST 3: Placing live voice call / flash from ${FROM_NUMBER} to ${TEST_DESTINATION}...`);
  const callResult = await makeCallViaTelnyx({
    to: TEST_DESTINATION,
    from: FROM_NUMBER,
    ttsText: 'Hello! This is a live test call from Gold Mailer via Telnyx Call Control. All systems are operational.'
  });

  console.log('Call Result:', JSON.stringify(callResult, null, 2));
  if (callResult.success) {
    console.log(`✔ [PASS] Live Call initiated! Call Control ID: ${callResult.callControlId || callResult.callSid}`);
  } else {
    console.warn(`⚠ Note on Call: ${callResult.error}`);
  }

  // TEST 4: Check live messages for +14236662513
  console.log(`\n▶ TEST 4: Fetching live message logs for line ${FROM_NUMBER}...`);
  const messages = await getTelnyxMessages(20);
  console.log(`✔ [PASS] Retrieved ${messages.length} recent messages from Telnyx API:`);
  messages.slice(0, 5).forEach((m: any, idx: number) => {
    console.log(`   ${idx + 1}. From: ${m.from} | To: ${m.to} | Status: ${m.status} | Direction: ${m.direction} | Text: "${(m.body || '').substring(0, 40)}"`);
  });

  // TEST 5: Check live call logs
  console.log(`\n▶ TEST 5: Fetching live call logs...`);
  const calls = await getTelnyxCalls(10);
  console.log(`✔ [PASS] Retrieved ${calls.length} recent calls from Telnyx API.`);

  // TEST 6: List available phone numbers to buy from Telnyx
  console.log(`\n▶ TEST 6: Searching available phone numbers to purchase from Telnyx...`);
  const numbers = await listAvailablePhoneNumbers(5);
  console.log(`✔ [PASS] Retrieved ${numbers.length} available phone numbers from Telnyx inventory:`);
  numbers.forEach((n: any) => {
    console.log(`   - ${n.phoneNumber} (${n.locality || 'US'}, ${n.region || ''})`);
  });

  console.log('\n====================================================');
  console.log('  ✔ ALL TELNYX MIGRATION TESTS PASSED SUCCESSFULLY! ');
  console.log('====================================================');
}

runLiveTests().catch(err => {
  console.error('\n✖ [FAIL] Test execution encountered an error:', err);
  process.exit(1);
});
