import http from 'http';
import handler from './api/index.js';

async function runVercelStabilityTest() {
  console.log('🧪 Starting Dedicated Vercel Serverless Function & Stability Test...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`, detail || '');
      failed++;
    }
  }

  const server = http.createServer((req, res) => {
    // Exactly matches how Vercel invokes api/index.js in serverless environment
    handler(req, res);
  });

  await new Promise<void>((resolve) => server.listen(4899, resolve));
  const baseUrl = 'http://127.0.0.1:4899';

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Vercel Health Check Endpoint
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Vercel Root /api Endpoint ---');
    const healthRes = await fetch(`${baseUrl}/api`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, '1.1 /api returns 200 OK', healthRes.status);
    assert(healthData.status === 'ok' && healthData.service?.includes('GoldMailer'), '1.2 /api returns service health status', healthData);

    // ------------------------------------------------------------------------
    // TEST 2: Vercel Subroute via __route Rewrite (Registration)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Vercel Subroute Rewrite (Registration) ---');
    const testUsername = `vercel_stable_${Date.now()}`;
    const testPassword = 'VercelPassword2026!';
    const regRes = await fetch(`${baseUrl}/api?__route=auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Vercel',
        lastName: 'Tester',
        username: testUsername,
        password: testPassword,
        phone: '+1 555-444-3333'
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, '2.1 Registration via Vercel rewrite succeeds with 201 Created', regRes.status);
    assert(Boolean(regData.token), '2.2 Token returned on registration', regData.token);
    assert(regData.user?.email === `${testUsername}@goldmailer.xyz`, '2.3 Email correctly formatted as @goldmailer.xyz', regData.user?.email);
    const token = regData.token;

    // ------------------------------------------------------------------------
    // TEST 3: Vercel Subroute via __route Rewrite (Profile /api/auth/me)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Vercel Authenticated Route (/api/auth/me) ---');
    const meRes = await fetch(`${baseUrl}/api?__route=auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, '3.1 /api/auth/me via Vercel rewrite returns 200', meRes.status);
    assert(meData.user?.username === testUsername, '3.2 /api/auth/me returns valid user profile (NOT healthcheck)', meData);

    // ------------------------------------------------------------------------
    // TEST 4: Vercel Subroute via x-now-route-matches (Legacy / Fallback Header)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Vercel Fallback Routing via x-now-route-matches ---');
    const fallbackRes = await fetch(`${baseUrl}/api`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-now-route-matches': '1=auth%2Fme'
      }
    });
    const fallbackData = await fallbackRes.json();
    assert(fallbackRes.status === 200, '4.1 Fallback header routes to /api/auth/me with 200', fallbackRes.status);
    assert(fallbackData.user?.username === testUsername, '4.2 Fallback header returns valid user profile', fallbackData);

    // ------------------------------------------------------------------------
    // TEST 5: Direct Path Routing (/api/auth/login)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Direct Path Routing & Login Verification ---');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testUsername,
        password: testPassword
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, '5.1 Direct path login succeeds with 200 OK', loginRes.status);
    assert(Boolean(loginData.token), '5.2 Login returns valid session token');

    // ------------------------------------------------------------------------
    // TEST 6: Email Inbound & Fetch via Vercel Routing
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Inbound Email Reception & Inbox Retrieval ---');
    const inboundRes = await fetch(`${baseUrl}/api?__route=webhook/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: `${testUsername}@goldmailer.xyz`,
        from: 'sender@gmail.com',
        subject: 'Vercel Serverless Stability Test Email',
        body: '<p>Testing stability on Vercel Serverless architecture.</p>'
      })
    });
    assert(inboundRes.status === 200, '6.1 Inbound webhook receives and persists email via Vercel rewrite');

    const emailsRes = await fetch(`${baseUrl}/api?__route=emails/${encodeURIComponent(`${testUsername}@goldmailer.xyz`)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const emailsData = await emailsRes.json();
    assert(Array.isArray(emailsData), '6.2 Emails list returned as array');
    const foundEmail = emailsData.find((e: any) => e.subject === 'Vercel Serverless Stability Test Email');
    assert(Boolean(foundEmail), '6.3 Inbound email is present in user inbox', foundEmail?.subject);

    console.log(`\n=============================================================`);
    console.log(`🎉 ALL VERCEL STABILITY TESTS PASSED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=============================================================`);

  } finally {
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runVercelStabilityTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
