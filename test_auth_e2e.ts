import { app } from './src/server/app.ts';
import http from 'http';
import * as OTPAuth from 'otpauth';

async function runTests() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3333, resolve));
  const baseUrl = 'http://127.0.0.1:3333';

  console.log('🧪 Starting End-to-End Authentication & Security Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // ================= TEST 1: REGISTRATION & CASE INSENSITIVITY =================
    console.log('--- TEST GROUP 1: Signup & Registration ---');
    const uniqueUser = `qa_tester_${Date.now()}`;
    const testPassword = 'StrongPassword123!';
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Alex',
        lastName: 'Tester',
        username: uniqueUser,
        password: testPassword,
        phone: '+1 555-019-2834',
        country: 'United States'
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && regData.success === true, '1.1 Signup succeeds with 201');
    assert(
      regData.user.email === `${uniqueUser.toLowerCase()}@goldmailer.com` ||
      regData.user.email === `${uniqueUser.toLowerCase()}@goldmailer.xyz`,
      '1.2 Email generated properly as @goldmailer.com / .xyz'
    );
    assert(Array.isArray(regData.backup_codes) && regData.backup_codes.length === 10, '1.3 10 Emergency backup codes generated');

    // Duplicate username check
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Alex',
        username: uniqueUser.toUpperCase(),
        password: testPassword
      })
    });
    assert(dupRes.status === 409, '1.4 Duplicate username rejected (case-insensitive)');

    // ================= TEST 2: LOGIN & LOOKUP VARIATIONS =================
    console.log('\n--- TEST GROUP 2: Login Bug Fix Verification ---');
    // Login with exact email
    const loginEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `${uniqueUser}@goldmailer.xyz`,
        password: testPassword
      })
    });
    const loginEmailData = await loginEmailRes.json();
    assert(loginEmailRes.status === 200 && loginEmailData.token, '2.1 Login with user@goldmailer.xyz recognizes account immediately');

    // Login with uppercase / mixed case username
    const loginUpperRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser.toUpperCase(),
        password: testPassword
      })
    });
    assert(loginUpperRes.status === 200, '2.2 Login with UPPERCASE username recognized');

    // Login with @prefix
    const loginAtRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `@${uniqueUser}`,
        password: testPassword
      })
    });
    assert(loginAtRes.status === 200, '2.3 Login with @username recognized');

    // Login with @goldmailer.com variation
    const loginComRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `${uniqueUser}@goldmailer.com`,
        password: testPassword
      })
    });
    assert(loginComRes.status === 200, '2.4 Login with user@goldmailer.com recognized');

    // Login with wrong password
    const badPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: 'WrongPassword999'
      })
    });
    assert(badPassRes.status === 401, '2.5 Login with invalid password returns 401');

    // Login with non-existent user
    const noUserRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'non_existent_ghost_user_99',
        password: testPassword
      })
    });
    assert(noUserRes.status === 404, '2.6 Login with non-existent user returns 404');

    // ================= TEST 3: TWO-FACTOR AUTHENTICATION (2FA) =================
    console.log('\n--- TEST GROUP 3: 2FA Enforcement & Verification ---');
    const authToken = loginEmailData.token;

    // A. Setup 2FA
    const setup2FARes = await fetch(`${baseUrl}/api/security/2fa/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      }
    });
    const setup2FAData = await setup2FARes.json();
    assert(Boolean(setup2FAData.secret && setup2FAData.otpauth_url), '3.1 2FA setup generates TOTP secret');

    // Generate valid TOTP token
    const totp = new OTPAuth.TOTP({
      issuer: 'GoldMailer',
      label: `${uniqueUser}@goldmailer.xyz`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setup2FAData.secret)
    });
    const validOtp = totp.generate();

    // Enable 2FA
    const enableRes = await fetch(`${baseUrl}/api/security/2fa/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ code: validOtp })
    });
    const enableData = await enableRes.json();
    assert(enableData.two_factor_enabled === true, '3.2 2FA successfully enabled with TOTP code');

    // B. Attempt login with password only (MUST REQUIRE 2FA - NO BYPASS)
    const loginNo2FARes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: testPassword
      })
    });
    const loginNo2FAData = await loginNo2FARes.json();
    assert(
      loginNo2FAData.requires_2fa === true && Boolean(loginNo2FAData.temp_auth_token),
      '3.3 Login enforces 2FA requirement: returns requires_2fa=true and temp_auth_token'
    );
    assert(!loginNo2FAData.token, '3.4 Access token is NOT granted without 2FA code (bypass prevented)');

    // C. Verify with wrong 2FA code
    const loginBad2FARes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: testPassword,
        totp_code: '000000'
      })
    });
    assert(loginBad2FARes.status === 401, '3.5 Login with invalid 2FA code returns 401');

    // D. Verify with valid TOTP code
    const freshOtp = totp.generate();
    const loginValid2FARes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: testPassword,
        totp_code: freshOtp
      })
    });
    const loginValid2FAData = await loginValid2FARes.json();
    assert(loginValid2FARes.status === 200 && Boolean(loginValid2FAData.token), '3.6 Login with valid TOTP code succeeds');

    // E. Verify with 8-digit Emergency Backup Code
    const testBackupCode = enableData.backup_codes[0];
    const loginBackupRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        temp_auth_token: loginNo2FAData.temp_auth_token,
        code: testBackupCode
      })
    });
    const loginBackupData = await loginBackupRes.json();
    assert(loginBackupRes.status === 200 && Boolean(loginBackupData.token), '3.7 Login with 8-digit backup code succeeds');

    // ================= TEST 4: FORGOT PASSWORD & RECOVERY FLOW =================
    console.log('\n--- TEST GROUP 4: Forgot Password Flow ---');
    // Set a recovery email on profile
    const recoveryEmail = `my_personal_recovery_${Date.now()}@gmail.com`;
    await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ backup_email: recoveryEmail })
    });

    // Request forgot password
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: uniqueUser })
    });
    const forgotData = await forgotRes.json();
    assert(forgotRes.status === 200 && forgotData.success === true, '4.1 Forgot Password request generates reset link');
    assert(Boolean(forgotData.reset_token), '4.2 Secure reset token generated with expiry');
    assert(Boolean(forgotData.recovery_email), '4.3 Targeted to linked recovery Gmail address');

    // Reset password with token
    const newSecretPassword = 'BrandNewPassword2026!';
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: forgotData.reset_token,
        email: `${uniqueUser}@goldmailer.xyz`,
        new_password: newSecretPassword
      })
    });
    const resetData = await resetRes.json();
    assert(resetRes.status === 200 && resetData.success === true, '4.4 Password updated successfully via reset token');

    // Verify old password fails
    const oldPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: testPassword
      })
    });
    assert(oldPassRes.status === 401, '4.5 Old password rejected after reset');

    // Verify new password works
    const newPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: uniqueUser,
        password: newSecretPassword,
        totp_code: totp.generate()
      })
    });
    assert(newPassRes.status === 200, '4.6 Login with new password succeeds');

    // Try reusing expired/consumed reset token
    const reuseResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: forgotData.reset_token,
        new_password: 'AnotherPassword!'
      })
    });
    assert(reuseResetRes.status === 400, '4.7 Consumed reset token cannot be reused');

    console.log(`\n==============================================`);
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================`);
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
