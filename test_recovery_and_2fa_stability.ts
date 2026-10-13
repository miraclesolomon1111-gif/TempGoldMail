import { app, ensureDataLoaded } from './src/server/app.ts';
import { db } from './src/server/db.ts';
import http from 'http';
import fs from 'fs';

async function runTest() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3999, resolve));
  const baseUrl = 'http://127.0.0.1:3999';

  console.log('🧪 Testing 2FA and Recovery Details Stability...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    const username = `stable_user_${Date.now()}`;
    const email = `${username}@goldmailer.xyz`;
    const password = 'TestPassword123!';

    // 1. Create account
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Stability',
        lastName: 'User',
        username,
        password,
        phone: '+1 234 567 8901'
      })
    });
    const regData = await regRes.json();
    assert(regRes.ok && regData.token, '1. Account registered successfully');
    const token = regData.token;

    // 2. Enable 2FA
    const setup2faRes = await fetch(`${baseUrl}/api/security/2fa/setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const setup2faData = await setup2faRes.json();
    const secret = setup2faData.secret;

    const OTPAuth = await import('otpauth');
    const totpObj = new OTPAuth.TOTP({
      issuer: 'GoldMailer',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });
    const totpToken = totpObj.generate();

    const verifyRes = await fetch(`${baseUrl}/api/security/2fa/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: totpToken, secret })
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.ok && verifyData.two_factor_enabled === true, '2. 2FA enabled successfully');

    // 3. Save Recovery Details (both recovery_phone and backup_email / recovery_email)
    const updateRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recovery_phone: '+1 555-888-9999',
        recovery_email: 'recovery.person@gmail.com'
      })
    });
    const updateData = await updateRes.json();
    assert(updateRes.ok, '3. Profile update responded OK');
    assert(updateData.user.recovery_phone === '+1 555-888-9999', '3.1 Recovery phone saved in response');
    assert(updateData.user.backup_email === 'recovery.person@gmail.com', '3.2 Recovery email saved as backup_email');

    // 4. Verify /api/auth/me immediately
    const meRes1 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData1 = await meRes1.json();
    assert(meData1.user.two_factor_enabled === true, '4.1 2FA enabled in /api/auth/me');
    assert(meData1.user.recovery_phone === '+1 555-888-9999', '4.2 Recovery phone present in /api/auth/me');
    assert(meData1.user.backup_email === 'recovery.person@gmail.com', '4.3 Backup email present in /api/auth/me');

    // 5. Simulate client syncing multi-accounts (where email might be external, username, or multi-account entry)
    const syncRes = await fetch(`${baseUrl}/api/auth/sync-client-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accounts: [
          {
            id: updateData.user.id,
            email: username, // Client may send username or external email
            username: username,
            name: 'Stability User',
            token: token
          },
          {
            email: 'odoborlawrita@gmail.com',
            username: 'odoborlawrita',
            name: 'Rita User',
            token: ''
          }
        ]
      })
    });
    assert(syncRes.ok, '5.1 /api/auth/sync-client-accounts called');

    // 6. Verify 2FA and recovery details were NOT erased by syncClientAccounts
    const meRes2 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData2 = await meRes2.json();
    assert(meData2.user.two_factor_enabled === true, '6.1 2FA is STILL enabled after syncClientAccounts');
    assert(meData2.user.recovery_phone === '+1 555-888-9999', '6.2 Recovery phone is STILL saved after syncClientAccounts');
    assert(meData2.user.backup_email === 'recovery.person@gmail.com', '6.3 Backup email is STILL saved after syncClientAccounts');

    // 7. Call Admin overview (which iterates and upserts all users)
    const adminTokenRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'miracle', password: '@654413Mm' })
    });
    const adminTokenData = await adminTokenRes.json();
    if (adminTokenData.token) {
      await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${adminTokenData.token}` }
      });
      await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminTokenData.token}` }
      });
    }

    // 8. Re-check /api/auth/me after admin loops
    const meRes3 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData3 = await meRes3.json();
    assert(meData3.user.two_factor_enabled === true, '8.1 2FA is STILL enabled after admin sync');
    assert(meData3.user.recovery_phone === '+1 555-888-9999', '8.2 Recovery phone is STILL saved after admin sync');
    assert(meData3.user.backup_email === 'recovery.person@gmail.com', '8.3 Backup email is STILL saved after admin sync');

    // 9. Check on disk (.goldmailer_data.json) directly
    const diskRaw = fs.readFileSync('.goldmailer_data.json', 'utf-8');
    const diskParsed = JSON.parse(diskRaw);
    const diskUser = (diskParsed.users || diskParsed.goldUsers).find((u: any) => u.id === updateData.user.id || u.username === username);
    assert(Boolean(diskUser), '9.1 User exists on disk');
    assert(diskUser?.two_factor_enabled === true, '9.2 User on disk has two_factor_enabled = true');
    assert(diskUser?.recovery_phone === '+1 555-888-9999', '9.3 User on disk has recovery_phone preserved');
    assert(diskUser?.backup_email === 'recovery.person@gmail.com', '9.4 User on disk has backup_email preserved');

    // 10. Verify login attempt requires 2FA
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: username, password })
    });
    const loginData = await loginRes.json();
    assert(loginData.requires_2fa === true, '10.1 Login attempt strictly prompts for 2FA');

  } finally {
    server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
