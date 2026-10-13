import { app } from './src/server/app.ts';
import { db } from './src/server/db.ts';
import http from 'http';
import * as OTPAuth from 'otpauth';

async function runTest() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4567, resolve));
  const baseUrl = 'http://127.0.0.1:4567';

  console.log('🧪 Running Full Verification Test for User Requirements...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Step 1: Create a Gmail/GoldMailer Account
    // -------------------------------------------------------------
    console.log('--- STEP 1: Create Test Account ---');
    const username = `test_account_${Date.now()}`;
    const password = 'SecurePassword2026!';
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        username,
        password,
        phone: '+1 555-010-0000',
        country: 'United States'
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && Boolean(regData.token), '1.1 Account created successfully', regData);
    const tokenDev1 = regData.token;
    const sessionTokenDev1 = regData.session_token;
    const email = regData.user.email;

    // -------------------------------------------------------------
    // Step 2: Turn on 2FA & Authenticator Saving
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Turn on 2FA & Authenticator Saving ---');
    // A. Setup 2FA
    const setupRes = await fetch(`${baseUrl}/api/security/2fa/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      }
    });
    const setupData = await setupRes.json();
    assert(Boolean(setupData.secret && setupData.otpauth_url), '2.1 2FA setup generates secret', setupData);

    // B. Generate TOTP code
    const totp = new OTPAuth.TOTP({
      issuer: 'GoldMailer',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setupData.secret)
    });
    const validOtp = totp.generate();

    // C. Enable 2FA
    const enableRes = await fetch(`${baseUrl}/api/security/2fa/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      },
      body: JSON.stringify({ code: validOtp, secret: setupData.secret })
    });
    const enableData = await enableRes.json();
    assert(enableData.two_factor_enabled === true, '2.2 Authenticator enabled and verified', enableData);
    assert(Array.isArray(enableData.backup_codes) && enableData.backup_codes.length === 10, '2.3 Backup codes generated on 2FA enable');

    // -------------------------------------------------------------
    // Step 3: Regenerate & Save Backup Codes
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Generate & Save Backup Codes ---');
    const regenRes = await fetch(`${baseUrl}/api/security/backup-codes/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      }
    });
    const regenData = await regenRes.json();
    assert(Array.isArray(regenData.backup_codes) && regenData.backup_codes.length === 10, '3.1 Backup codes regenerated and saved', regenData);
    const savedBackupCodes = regenData.backup_codes;

    // -------------------------------------------------------------
    // Step 4: Add & Save Recovery Phone and Backup Email
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Add Recovery Phone and Backup Email ---');
    const testRecoveryPhone = '+1 555-987-6543';
    const testBackupEmail = 'tester.recovery@gmail.com';

    const profileRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      },
      body: JSON.stringify({
        recovery_phone: testRecoveryPhone,
        backup_email: testBackupEmail
      })
    });
    const profileData = await profileRes.json();
    assert(profileData.user.recovery_phone === testRecoveryPhone, '4.1 Recovery phone saved in profile update');
    assert(profileData.user.backup_email === testBackupEmail, '4.2 Backup email saved in profile update');

    // Verify /api/auth/me returns all saved data
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    const meData = await meRes.json();
    assert(meData.user.recovery_phone === testRecoveryPhone, '4.3 Recovery phone persisted in /api/auth/me');
    assert(meData.user.backup_email === testBackupEmail, '4.4 Backup email persisted in /api/auth/me');
    assert(meData.user.two_factor_enabled === true, '4.5 2FA enabled status persisted in /api/auth/me');
    assert(meData.user.backup_codes.length === 10, '4.6 10 backup codes persisted in /api/auth/me');

    // -------------------------------------------------------------
    // Step 5: Check Current Login Session (Device 1)
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Check Current Login Session ---');
    const sessRes = await fetch(`${baseUrl}/api/security/sessions`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    const sessData = await sessRes.json();
    assert(Array.isArray(sessData.sessions) && sessData.sessions.length >= 1, '5.1 Current device session recorded', sessData);
    const initialSessionCount = sessData.sessions.length;

    // -------------------------------------------------------------
    // Step 6: Open New Tab / Device 2 Login - 2FA Enforced
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: Open New Tab / Attempt Login (2FA Challenge) ---');
    const loginChallengeRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      },
      body: JSON.stringify({
        identifier: username,
        password
      })
    });
    const loginChallengeData = await loginChallengeRes.json();
    assert(
      loginChallengeData.requires_2fa === true && Boolean(loginChallengeData.attempt_id) && Boolean(loginChallengeData.temp_auth_token),
      '6.1 2FA is strictly enforced: returns requires_2fa=true and attempt_id',
      loginChallengeData
    );
    assert(!loginChallengeData.token, '6.2 Token not issued before 2FA verification');
    const attemptId = loginChallengeData.attempt_id;
    const tempAuthToken = loginChallengeData.temp_auth_token;

    // -------------------------------------------------------------
    // Step 7: Confirm Login from Another Device (Cross-Device 2FA)
    // -------------------------------------------------------------
    console.log('\n--- STEP 7: Confirm Login from Another Device ---');
    // Device 1 checks for pending login attempts
    const pendingRes = await fetch(`${baseUrl}/api/security/login-attempts/pending`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    const pendingAttempts = await pendingRes.json();
    assert(
      Array.isArray(pendingAttempts) && pendingAttempts.some((a: any) => a.id === attemptId),
      '7.1 Device 1 sees pending login approval request from Device 2',
      pendingAttempts
    );

    // Device 1 approves the login attempt ("Yes, it's me")
    const approveRes = await fetch(`${baseUrl}/api/security/login-attempts/${attemptId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      },
      body: JSON.stringify({ action: 'approve' })
    });
    const approveData = await approveRes.json();
    assert(approveData.status === 'approved', '7.2 Device 1 successfully approves login attempt');

    // Device 2 polls status and receives approved session
    const statusRes = await fetch(`${baseUrl}/api/security/login-attempts/${attemptId}/status`);
    const statusData = await statusRes.json();
    assert(
      statusData.status === 'approved' && Boolean(statusData.token) && Boolean(statusData.session_token),
      '7.3 Device 2 receives approved access token via cross-device approval',
      statusData
    );
    const tokenDev2 = statusData.token;
    const sessionTokenDev2 = statusData.session_token;

    // -------------------------------------------------------------
    // Step 8: Verify 2FA with TOTP Code (Direct Device 2 Login)
    // -------------------------------------------------------------
    console.log('\n--- STEP 8: Verify 2FA with Authenticator Code ---');
    const totpCode = totp.generate();
    const loginTotpRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: username,
        password,
        totp_code: totpCode
      })
    });
    const loginTotpData = await loginTotpRes.json();
    assert(loginTotpRes.status === 200 && Boolean(loginTotpData.token), '8.1 Login with Authenticator TOTP succeeds');

    // -------------------------------------------------------------
    // Step 9: Verify 2FA with 8-Digit Emergency Backup Code
    // -------------------------------------------------------------
    console.log('\n--- STEP 9: Verify 2FA with Backup Code ---');
    const codeToUse = savedBackupCodes[0];
    const backupVerifyRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: username,
        temp_auth_token: tempAuthToken,
        code: codeToUse
      })
    });
    const backupVerifyData = await backupVerifyRes.json();
    assert(backupVerifyRes.status === 200 && Boolean(backupVerifyData.token), '9.1 Login with backup code succeeds');

    // Check backup code was consumed (single-use)
    const meAfterBackupRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    const meAfterBackup = await meAfterBackupRes.json();
    assert(
      meAfterBackup.user.backup_codes.length === 9 && !meAfterBackup.user.backup_codes.includes(codeToUse),
      '9.2 Backup code consumed: 9 codes remaining and used code purged'
    );

    // -------------------------------------------------------------
    // Step 10: Check Active Device Sessions (Device 1 and Device 2)
    // -------------------------------------------------------------
    console.log('\n--- STEP 10: Check Active Device Sessions ---');
    const sessionsCheckRes = await fetch(`${baseUrl}/api/security/sessions`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    const sessionsCheckData = await sessionsCheckRes.json();
    assert(
      sessionsCheckData.sessions.length >= 2,
      `10.1 Multiple active device sessions visible (${sessionsCheckData.sessions.length} sessions detected)`
    );

    const dev2SessionObj = sessionsCheckData.sessions.find(
      (s: any) => s.session_token === sessionTokenDev2 || s.token === sessionTokenDev2 || s.id === sessionTokenDev2
    );
    assert(Boolean(dev2SessionObj), '10.2 Device 2 session exists in active sessions list');

    // -------------------------------------------------------------
    // Step 11: Device 1 Logs Out Device 2
    // -------------------------------------------------------------
    console.log('\n--- STEP 11: Log Out Specific Device ---');
    const revokeRes = await fetch(`${baseUrl}/api/security/sessions/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`
      },
      body: JSON.stringify({
        session_token: sessionTokenDev2,
        id: dev2SessionObj?.id
      })
    });
    const revokeData = await revokeRes.json();
    assert(revokeRes.status === 200 && revokeData.success === true, '11.1 Log out this device API succeeds');

    // -------------------------------------------------------------
    // Step 12: Check if Log Out Actually Logs Out Device 2
    // -------------------------------------------------------------
    console.log('\n--- STEP 12: Verify Device 2 Is Logged Out ---');
    const dev2MeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenDev2}` }
    });
    assert(
      dev2MeRes.status === 401,
      `12.1 Device 2 request rejected with 401 Unauthorized after revocation (Status: ${dev2MeRes.status})`
    );

    // Device 1 remains logged in and active
    const dev1MeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenDev1}` }
    });
    assert(dev1MeRes.status === 200, '12.2 Device 1 remains active and authenticated');

    console.log(`\n==============================================`);
    console.log(`🎉 ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================`);
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTest();
