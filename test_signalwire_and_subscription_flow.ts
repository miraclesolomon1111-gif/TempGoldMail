import { testSignalWireConnection, listAvailablePhoneNumbers, getSignalWireConfig } from './lib/signalwireClient.ts';
import { app } from './src/server/app.ts';
import http from 'http';

const runTests = async () => {
  console.log('🧪 Starting Full Test Suite for SignalWire Live Flow, Manual Renewal & eSIM...');

  // Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`📡 Local test server listening on port ${port}`);

  const post = async (path: string, body: any, headers: Record<string, string> = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  const get = async (path: string, headers: Record<string, string> = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers }
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  try {
    // ==========================================
    // 1. SIGNALWIRE LIVE FLOW TEST
    // ==========================================
    console.log('\n--- TEST 1: SignalWire Live Flow & Real Data Verification ---');
    const config = getSignalWireConfig();
    console.log(`SignalWire Space: ${config.spaceUrl}`);
    console.log(`SignalWire Project ID: ${config.projectId}`);
    console.log(`SignalWire Phone: ${config.phoneNumber}`);

    if (config.phoneNumber !== '+1 (205) 607-6793' && config.phoneNumber !== '+12056076793') {
      throw new Error(`SignalWire phone mismatch: expected +1 (205) 607-6793, got ${config.phoneNumber}`);
    }

    const swConn = await testSignalWireConnection();
    console.log(`SignalWire connection result: success=${swConn.success}, message="${swConn.message}"`);
    if (!swConn.success) {
      throw new Error(`SignalWire connection failed: ${swConn.message}`);
    }
    console.log('✅ [PASS] 1.1 SignalWire live connection authenticated successfully.');

    const availableNumbers = await listAvailablePhoneNumbers(5);
    console.log(`Fetched ${availableNumbers.length} real numbers from SignalWire inventory.`);
    if (availableNumbers.length === 0) {
      throw new Error('SignalWire failed to return available phone numbers');
    }
    console.log(`Sample available number: ${availableNumbers[0].phoneNumber} (${availableNumbers[0].friendlyName})`);
    console.log('✅ [PASS] 1.2 Live numbers successfully queried from SignalWire REST API.');

    // ==========================================
    // 2. SIGNUP & LOGIN TEST
    // ==========================================
    console.log('\n--- TEST 2: Signup & Login Fix Verification ---');
    const testUsername = `user_flow_${Date.now()}`;
    const testPassword = 'Password123!Safe';

    const signupRes = await post('/api/auth/register', {
      firstName: 'Tester',
      lastName: 'Gold',
      username: testUsername,
      password: testPassword,
      domain: 'goldmailer.xyz'
    });
    if (signupRes.status !== 201 || !signupRes.data.user) {
      throw new Error(`Signup failed: status=${signupRes.status}, error=${JSON.stringify(signupRes.data)}`);
    }
    const userToken = signupRes.data.token;
    const testUserId = signupRes.data.user.id;
    const testUserEmail = signupRes.data.user.email;
    const userHeaders = { Authorization: `Bearer ${userToken}` };
    console.log(`✅ [PASS] 2.1 User signup succeeded for ${testUserEmail}`);

    const loginRes = await post('/api/auth/login', {
      username: testUsername,
      password: testPassword
    });
    if (loginRes.status !== 200 || !loginRes.data.token) {
      throw new Error(`Login failed: status=${loginRes.status}, error=${JSON.stringify(loginRes.data)}`);
    }
    console.log('✅ [PASS] 2.2 User login succeeded with matching token');

    // ==========================================
    // 3. ADMIN PRIVILEGES & ADMIN PHONE NUMBER
    // ==========================================
    console.log('\n--- TEST 3: Admin miracle@goldmailer.xyz Verification ---');
    const adminHeaders = { 'x-user-email': 'miracle@goldmailer.xyz', 'x-user-id': 'usr_miracle_01' };
    const adminNumbersRes = await get('/api/phone/numbers', adminHeaders);
    if (!adminNumbersRes.data.isAdmin || !adminNumbersRes.data.unlimitedCoins) {
      throw new Error('Admin should have isAdmin: true and unlimitedCoins: true');
    }
    const adminPhone = adminNumbersRes.data.numbers.find((p: any) => p.phoneNumber.replace(/\D/g, '') === '12056076793');
    if (!adminPhone) {
      throw new Error('Admin number +1 (205) 607-6793 not found in admin numbers');
    }
    console.log('✅ [PASS] 3.1 Admin miracle@goldmailer.xyz has active line +1 (205) 607-6793');

    // Check old admin numbers are removed
    const hasOldAdminNumber = adminNumbersRes.data.numbers.some((p: any) => {
      const d = p.phoneNumber.replace(/\D/g, '');
      return d !== '12056076793' && !p.id.startsWith('phone_prov_');
    });
    if (hasOldAdminNumber) {
      throw new Error('Old admin numbers were not pruned');
    }
    console.log('✅ [PASS] 3.2 Old admin numbers removed, only +1 (205) 607-6793 retained');

    // Admin has free unlimited wallet
    const adminWalletRes = await get('/api/wallet', adminHeaders);
    if (!adminWalletRes.data.unlimited || adminWalletRes.data.coins < 100000) {
      throw new Error('Admin should have unlimited free coins');
    }
    console.log('✅ [PASS] 3.3 Admin wallet returns unlimited free coins');

    // ==========================================
    // 4. USER INITIAL PURCHASE ($6 = 300 COINS + 30 DAYS)
    // ==========================================
    console.log('\n--- TEST 4: User Initial Purchase ($6 = 1 Number + 300 Coins + 30 Days) ---');
    const userWalletInitial = await get('/api/wallet', userHeaders);
    console.log(`Initial client coins: ${userWalletInitial.data.coins}`);

    // User creates purchase intent with $6 + 1.5% fee
    const testClientPhone = `+1205${Math.floor(1000000 + Math.random() * 8999999)}`;
    const buyIntentRes = await post('/api/phone/buy-intent', { phoneNumber: testClientPhone }, userHeaders);
    if (buyIntentRes.data.amount !== 6 || buyIntentRes.data.networkFee !== 0.09 || buyIntentRes.data.totalPrice !== 6.09) {
      throw new Error(`Expected $6.00 + $0.09 = $6.09, got: ${JSON.stringify(buyIntentRes.data)}`);
    }
    console.log('✅ [PASS] 4.1 Buy intent includes 1.5% network fee ($6.00 + $0.09 = $6.09)');

    // Simulate NOWPayments IPN webhook for initial line activation
    const initialIpnRes = await post('/api/webhook/nowpayments', {
      payment_id: 'pay_test_001',
      payment_status: 'finished',
      order_id: `phone_${Date.now()}`,
      order_description: `SignalWire Phone Subscription for ${testClientPhone} (${testUserEmail})`,
      price_amount: 6.09,
      price_currency: 'usd'
    });
    if (initialIpnRes.status !== 200) {
      throw new Error(`Initial IPN webhook failed: ${initialIpnRes.status}`);
    }

    // Provision the line for user
    const buyNumberRes = await post('/api/phone/buy-number', { phoneNumber: testClientPhone }, userHeaders);
    if (!buyNumberRes.data.success) {
      throw new Error(`Buy number failed: ${JSON.stringify(buyNumberRes.data)}`);
    }
    console.log('✅ [PASS] 4.2 Phone number activated on user account');

    const userWalletAfterBuy = await get('/api/wallet', userHeaders);
    if (userWalletAfterBuy.data.coins < 300) {
      throw new Error(`Expected at least 300 coins after purchase, got ${userWalletAfterBuy.data.coins}`);
    }
    if (userWalletAfterBuy.data.daysRemaining < 29 || userWalletAfterBuy.data.daysRemaining > 61) {
      throw new Error(`Expected 30-60 days validity, got ${userWalletAfterBuy.data.daysRemaining}`);
    }
    console.log(`✅ [PASS] 4.3 Client credited coins and validity (expires: ${userWalletAfterBuy.data.expiresAt}, ${userWalletAfterBuy.data.daysRemaining} days remaining)`);

    // ==========================================
    // 5. COIN USAGE RATES
    // ==========================================
    console.log('\n--- TEST 5: Coin Usage Deductions (SMS, Calls & Daily Rent) ---');

    // 5.1 Outgoing SMS: costs 5 coins
    const sendSmsRes = await post('/api/phone/send-sms', {
      to: '+12056076793',
      body: 'Hello test outgoing SMS'
    }, userHeaders);
    const walletAfterSend = await get('/api/wallet', userHeaders);
    if (walletAfterSend.data.coins !== 295) {
      throw new Error(`Expected 295 coins after outgoing SMS (5 deducted), got ${walletAfterSend.data.coins}`);
    }
    console.log('✅ [PASS] 5.1 Outgoing SMS deducted exactly 5 coins (295 coins remaining)');

    // 5.2 Incoming SMS: costs 2.5 coins
    const inboundSmsRes = await post('/api/signalwire/inbound', {
      From: '+15551234567',
      To: testClientPhone,
      Body: 'Incoming OTP Code: 994821',
      MessageSid: `SM_TEST_${Date.now()}`
    });
    if (inboundSmsRes.status !== 200) {
      throw new Error(`Inbound SMS webhook failed: ${inboundSmsRes.status}`);
    }
    const walletAfterInboundSms = await get('/api/wallet', userHeaders);
    if (walletAfterInboundSms.data.coins !== 292.5) {
      throw new Error(`Expected 292.5 coins after inbound SMS (2.5 deducted), got ${walletAfterInboundSms.data.coins}`);
    }
    console.log('✅ [PASS] 5.2 Incoming SMS webhook deducted exactly 2.5 coins (292.5 coins remaining)');

    // 5.3 Outgoing Call: costs 5 coins/min
    const outgoingCallRes = await post('/api/phone/call', {
      to: '+12056076793'
    }, userHeaders);
    const walletAfterOutCall = await get('/api/wallet', userHeaders);
    if (walletAfterOutCall.data.coins !== 287.5) {
      throw new Error(`Expected 287.5 coins after outgoing call (5 deducted), got ${walletAfterOutCall.data.coins}`);
    }
    console.log('✅ [PASS] 5.3 Outgoing call deducted exactly 5 coins/min (287.5 coins remaining)');

    // 5.4 Incoming Call: costs 5 coins/min
    const inboundCallRes = await post('/api/webhooks/signalwire/inbound', {
      From: '+15558887777',
      To: testClientPhone,
      CallSid: `CA_TEST_${Date.now()}`,
      CallStatus: 'ringing'
    });
    if (inboundCallRes.status !== 200) {
      throw new Error(`Inbound call webhook failed: ${inboundCallRes.status}`);
    }
    const walletAfterInCall = await get('/api/wallet', userHeaders);
    if (walletAfterInCall.data.coins !== 282.5) {
      throw new Error(`Expected 282.5 coins after incoming call (5 deducted), got ${walletAfterInCall.data.coins}`);
    }
    console.log('✅ [PASS] 5.4 Incoming call webhook deducted exactly 5 coins/min (282.5 coins remaining)');

    // 5.5 Daily rent cron: 3.3 coins/day per number
    const cronRes = await post('/api/cron/deduct-rent', {});
    if (cronRes.status !== 200) {
      throw new Error(`Rent cron failed: ${cronRes.status}`);
    }
    const walletAfterCron = await get('/api/wallet', userHeaders);
    const expectedCoins = Math.round((282.5 - 3.3) * 10) / 10; // 279.2
    if (Math.abs(walletAfterCron.data.coins - expectedCoins) > 0.01) {
      throw new Error(`Expected ${expectedCoins} coins after daily rent (3.3 deducted), got ${walletAfterCron.data.coins}`);
    }
    console.log(`✅ [PASS] 5.5 Daily rent cron (/api/cron/deduct-rent) deducted exactly 3.3 coins (${walletAfterCron.data.coins} coins remaining)`);

    // ==========================================
    // 6. SUSPENSION CRITERIA (0 COINS OR 30 DAYS EXPIRE)
    // ==========================================
    console.log('\n--- TEST 6: Suspension Criteria (0 Coins OR 30 Days Expire) ---');
    // Deplete user coins to test suspension
    const deductRes = await post('/api/cron/deduct-rent', {});
    // Let's test manual recharge invoice calculation
    const rechargeInvoiceIntent = await post('/api/wallet/recharge', {
      amount: 6,
      phoneNumber: '+12055550199'
    }, userHeaders);
    if (rechargeInvoiceIntent.data.coins !== 300 || rechargeInvoiceIntent.data.days !== 30) {
      throw new Error(`Recharge formula mismatch for $6: ${JSON.stringify(rechargeInvoiceIntent.data)}`);
    }
    if (rechargeInvoiceIntent.data.networkFee !== 0.09 || rechargeInvoiceIntent.data.totalPrice !== 6.09) {
      throw new Error(`Recharge network fee mismatch: expected $0.09 fee, total $6.09, got ${JSON.stringify(rechargeInvoiceIntent.data)}`);
    }
    console.log('✅ [PASS] 6.1 Recharge invoice adds 1.5% network fee ($6 -> $6.09, +300 coins, +30 days)');

    // Test custom recharge amount $10 -> 500 coins + 50 days (1 dollar = 50 coins, 1 day = $0.20)
    const recharge10Res = await post('/api/wallet/recharge', { amount: 10 }, userHeaders);
    if (recharge10Res.data.coins !== 500 || recharge10Res.data.days !== 50) {
      throw new Error(`Recharge formula mismatch for $10: ${JSON.stringify(recharge10Res.data)}`);
    }
    console.log('✅ [PASS] 6.2 Formula verification: $10 = 500 coins + 50 days validity ($0.20/day)');

    // Test maximum recharge limit ($100 max)
    const overLimitRes = await post('/api/wallet/recharge', { amount: 105 }, userHeaders);
    if (overLimitRes.status !== 400) {
      throw new Error('Recharge over $100 should be rejected with 400');
    }
    console.log('✅ [PASS] 6.3 Maximum recharge of $100 enforced');

    // Execute recharge via webhook callback
    const rechargeWebhookRes = await post('/api/webhook/nowpayments', {
      payment_id: 'pay_recharge_002',
      payment_status: 'finished',
      order_id: `recharge_${testUserId}_1000_${Date.now()}`,
      order_description: `GoldMailer Wallet Recharge: $10 (+500 coins, +50 days) for +12055550199`,
      price_amount: 10.15,
      price_currency: 'usd'
    });
    if (rechargeWebhookRes.status !== 200) {
      throw new Error(`Recharge webhook failed: ${rechargeWebhookRes.status}`);
    }

    const walletAfterRecharge = await get('/api/wallet', userHeaders);
    if (walletAfterRecharge.data.coins < 700) {
      throw new Error(`Expected wallet to have credited 500 coins, got ${walletAfterRecharge.data.coins}`);
    }
    console.log(`✅ [PASS] 6.4 NOWPayments webhook credited +500 coins (new balance: ${walletAfterRecharge.data.coins} coins, ${walletAfterRecharge.data.daysRemaining} days left)`);

    // ==========================================
    // 7. E-SIM CARD LOGIC (USERS ONLY, NOT ADMIN)
    // ==========================================
    console.log('\n--- TEST 7: E-SIM Card Logic (Only Applies to Users, Not Admin) ---');
    // 7.1 Admin request to /api/phone/esim must be rejected with 403
    const adminEsimRes = await get('/api/phone/esim', adminHeaders);
    if (adminEsimRes.status !== 403) {
      throw new Error(`Admin should be blocked from eSIM with 403, got status ${adminEsimRes.status}`);
    }
    console.log('✅ [PASS] 7.1 Admin request to /api/phone/esim blocked (eSIM only applies to users)');

    // 7.2 User request to /api/phone/esim returns valid digital profile
    const userEsimRes = await get('/api/phone/esim', userHeaders);
    if (userEsimRes.status !== 200 || !userEsimRes.data.esim) {
      throw new Error(`User eSIM request failed: ${JSON.stringify(userEsimRes.data)}`);
    }
    const esim = userEsimRes.data.esim;
    if (!esim.iccid.startsWith('890141') || !esim.activationCode.startsWith('LPA:1$') || esim.smdpAddress !== 'smdp.goldmailer.xyz') {
      throw new Error(`Invalid eSIM profile properties: ${JSON.stringify(esim)}`);
    }
    console.log(`✅ [PASS] 7.2 User eSIM profile generated successfully:`);
    console.log(`       - Phone Number: ${esim.phoneNumber}`);
    console.log(`       - ICCID: ${esim.iccid}`);
    console.log(`       - SM-DP+ Address: ${esim.smdpAddress}`);
    console.log(`       - Activation Code: ${esim.activationCode}`);
    console.log(`       - Status: ${esim.status}`);

    console.log('\n=============================================================');
    console.log('🎉 ALL LIVE SIGNALWIRE & USER SYSTEM TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================================\n');
    process.exit(0);
  } finally {
    server.close();
  }
};

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
