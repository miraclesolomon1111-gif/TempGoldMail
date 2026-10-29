import { app } from './src/server/app.ts';
import { db } from './src/server/db.ts';
import http from 'http';

async function testAutoForwarding() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4899, resolve));
  const baseUrl = 'http://127.0.0.1:4899';

  console.log('🧪 Starting Comprehensive Auto-Forwarding Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  const parseEmails = (data: any) => (Array.isArray(data) ? data : (data?.emails || []));

  try {
    // -------------------------------------------------------------
    // STEP 1: Create 2 Test Users (User A who forwards, User B who receives)
    // -------------------------------------------------------------
    console.log('--- STEP 1: Create User A and User B ---');
    const uA = `user_fwd_a_${Date.now()}`;
    const uB = `user_fwd_b_${Date.now()}`;
    const pwd = 'Password123!';

    const regARes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Alice',
        lastName: 'Forwarder',
        username: uA,
        password: pwd,
        country: 'United States'
      })
    });
    const regA = await regARes.json();
    assert(regARes.status === 201 && Boolean(regA.token), '1.1 User A registered successfully');

    const regBRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Bob',
        lastName: 'Receiver',
        username: uB,
        password: pwd,
        country: 'United States'
      })
    });
    const regB = await regBRes.json();
    assert(regBRes.status === 201 && Boolean(regB.token), '1.2 User B registered successfully');

    const tokenA = regA.token;
    const tokenB = regB.token;
    const emailA = regA.user.email; // e.g. user_fwd_a_... @goldmailer.xyz
    const emailB = regB.user.email; // e.g. user_fwd_b_... @goldmailer.xyz

    // -------------------------------------------------------------
    // STEP 2: Add Forwarding Address (User A adds User B as forward target)
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Add Forwarding Address with Verification ---');
    const addRes = await fetch(`${baseUrl}/api/forwarding/addresses/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ email: emailB })
    });
    const addData = await addRes.json();
    assert(addRes.status === 200 && addData.success === true, '2.1 Add forwarding address returns 200 success', addData);

    // Get confirmation code from User B's inbox or User A's forwarding_addresses list
    const getFwdRes = await fetch(`${baseUrl}/api/forwarding`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const fwdData = await getFwdRes.json();
    const targetEntry = (fwdData.forwarding_addresses || []).find((a: any) => a.email.toLowerCase() === emailB.toLowerCase());
    assert(Boolean(targetEntry), '2.2 Forwarding address added to list in pending verification state', targetEntry);
    const code = targetEntry?.verification_code;
    assert(Boolean(code && code.length === 6), '2.3 6-digit verification code generated', code);

    // Verify confirmation code
    const verifyRes = await fetch(`${baseUrl}/api/forwarding/addresses/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ email: emailB, code })
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200 && verifyData.success === true, '2.4 Verification code accepted', verifyData);

    // -------------------------------------------------------------
    // STEP 3: Enable Auto-Forwarding with 'keep' action
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Enable Auto-Forwarding (keep copy in inbox) ---');
    const setFwdRes = await fetch(`${baseUrl}/api/forwarding/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        enabled: true,
        forwarding_email: emailB,
        action: 'keep'
      })
    });
    const setFwdData = await setFwdRes.json();
    assert(setFwdData.success === true && setFwdData.settings.forwarding_enabled === true, '3.1 Auto-forwarding enabled with action=keep');

    // -------------------------------------------------------------
    // STEP 4: Trigger Forwarding Test Endpoint
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Trigger Forwarding Test Endpoint ---');
    const testFwdRes = await fetch(`${baseUrl}/api/forwarding/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ forwardTo: emailB })
    });
    const testFwdData = await testFwdRes.json();
    assert(testFwdRes.status === 200 && testFwdData.success === true, '4.1 /api/forwarding/test succeeds', testFwdData);

    // Check User B received the test email
    const inboxBRes1 = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const inboxBData1 = parseEmails(await inboxBRes1.json());
    const testReceived = inboxBData1.find((e: any) => e.subject?.includes('Test Forwarded Email'));
    assert(Boolean(testReceived), '4.2 User B received the test forwarded email', testReceived?.subject);

    // -------------------------------------------------------------
    // STEP 5: Inbound Webhook / External Email Delivery with Auto-Forwarding
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Incoming Webhook Email Auto-Forwarding ---');
    const inboundPayload = {
      to: emailA,
      from: 'newsletter@github.com',
      subject: 'GitHub Digest: Your Weekly Summary',
      text: 'Here is your weekly GitHub summary with latest updates.',
      html: '<p>Here is your weekly GitHub summary with latest updates.</p>'
    };

    const webhookRes = await fetch(`${baseUrl}/api/webhook/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inboundPayload)
    });
    const webhookData = await webhookRes.json();
    assert(webhookRes.status === 200 && webhookData.success === true, '5.1 Inbound webhook accepted', webhookData);

    // Wait a brief moment for async dispatch
    await new Promise((r) => setTimeout(r, 200));

    // User A should have the email in inbox (keep action)
    const inboxARes = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const inboxAData = parseEmails(await inboxARes.json());
    const mailInA = inboxAData.find((e: any) => e.subject?.includes('GitHub Digest'));
    assert(Boolean(mailInA), '5.2 User A kept copy in Inbox (action=keep)', mailInA?.subject);

    // User B should have received the forwarded copy
    const inboxBRes2 = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const inboxBData2 = parseEmails(await inboxBRes2.json());
    const forwardedToB = inboxBData2.find((e: any) => e.subject?.includes('GitHub Digest'));
    assert(Boolean(forwardedToB), '5.3 User B received auto-forwarded email', forwardedToB?.subject);
    assert(forwardedToB?.subject?.startsWith('Fwd:'), '5.4 Forwarded email has Fwd: prefix in subject', forwardedToB?.subject);
    assert(forwardedToB?.body_text?.includes('Forwarded message') || forwardedToB?.text?.includes('Forwarded message'), '5.5 Forwarded email contains Gmail-style header block');

    // -------------------------------------------------------------
    // STEP 6: Forwarding Action: Mark as Read ('read')
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: Forwarding Action: Mark as Read ---');
    await fetch(`${baseUrl}/api/forwarding/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        enabled: true,
        forwarding_email: emailB,
        action: 'read'
      })
    });

    const simRes1 = await fetch(`${baseUrl}/api/emails/simulate-inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        to: emailA,
        from: 'alerts@bank.com',
        subject: 'Monthly Bank Statement Ready',
        body_text: 'Your statement is ready to view.'
      })
    });
    const simData1 = await simRes1.json();
    assert(simData1.success === true, '6.1 Incoming email simulated');

    await new Promise((r) => setTimeout(r, 200));

    // Verify User A's copy is marked as read
    const inboxARead = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const inboxAReadData = parseEmails(await inboxARead.json());
    const bankEmail = inboxAReadData.find((e: any) => e.subject?.includes('Monthly Bank Statement'));
    assert(Boolean(bankEmail && bankEmail.is_read === true), '6.2 Original copy marked as read in User A inbox', bankEmail?.is_read);

    // Verify User B received it
    const inboxBRead = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const inboxBReadData = parseEmails(await inboxBRead.json());
    const bankFwd = inboxBReadData.find((e: any) => e.subject?.includes('Monthly Bank Statement'));
    assert(Boolean(bankFwd), '6.3 User B received forwarded copy of bank email');

    // -------------------------------------------------------------
    // STEP 7: Forwarding Action: Delete ('delete' -> move to trash)
    // -------------------------------------------------------------
    console.log('\n--- STEP 7: Forwarding Action: Delete (move to trash) ---');
    await fetch(`${baseUrl}/api/forwarding/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        enabled: true,
        forwarding_email: emailB,
        action: 'delete'
      })
    });

    const simRes2 = await fetch(`${baseUrl}/api/emails/simulate-inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        to: emailA,
        from: 'security@cloud.com',
        subject: 'Security Notice: New Login Key Generated',
        body_text: 'A new security key was added.'
      })
    });
    assert((await simRes2.json()).success === true, '7.1 Second incoming email simulated');

    await new Promise((r) => setTimeout(r, 200));

    // Check User A Primary folder (should NOT contain the email)
    const inboxAPrim = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const primData = parseEmails(await inboxAPrim.json());
    const notInPrim = !primData.some((e: any) => e.subject?.includes('Security Notice'));
    assert(notInPrim, '7.2 Original email is deleted from Primary inbox');

    // Check User A Trash folder (SHOULD contain the email)
    const inboxATrash = await fetch(`${baseUrl}/api/emails?folder=trash`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const trashData = parseEmails(await inboxATrash.json());
    const inTrash = trashData.find((e: any) => e.subject?.includes('Security Notice'));
    assert(Boolean(inTrash), '7.3 Original email is moved to Trash (action=delete)');

    // User B received it
    const inboxBTrash = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const trashBData = parseEmails(await inboxBTrash.json());
    const bFwdNotice = trashBData.find((e: any) => e.subject?.includes('Security Notice'));
    assert(Boolean(bFwdNotice), '7.4 User B received forwarded copy even when original is deleted');

    // -------------------------------------------------------------
    // STEP 8: Loop Prevention (Do not forward emails originating from forwarding address)
    // -------------------------------------------------------------
    console.log('\n--- STEP 8: Loop Prevention ---');
    const loopRes = await fetch(`${baseUrl}/api/emails/simulate-inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        to: emailA,
        from: emailB, // Sender is the forward destination itself!
        subject: 'Loop check email from User B to User A',
        body_text: 'Should not bounce back to User B.'
      })
    });
    assert((await loopRes.json()).success === true, '8.1 Loop check email accepted');

    await new Promise((r) => setTimeout(r, 200));

    const checkBLoop = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const bLoopData = parseEmails(await checkBLoop.json());
    const loopedEmail = bLoopData.find((e: any) => e.subject?.includes('Loop check email'));
    assert(!loopedEmail, '8.2 Loop prevented: User B did not receive forwarded loop email');

    // -------------------------------------------------------------
    // STEP 9: Disable Forwarding Toggle
    // -------------------------------------------------------------
    console.log('\n--- STEP 9: Disable Forwarding ---');
    await fetch(`${baseUrl}/api/forwarding/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        enabled: false,
        forwarding_email: emailB,
        action: 'keep'
      })
    });

    const countBefore = bLoopData.length;

    await fetch(`${baseUrl}/api/emails/simulate-inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        to: emailA,
        from: 'no-forward@example.com',
        subject: 'Email while forwarding is disabled',
        body_text: 'This should stay only with User A.'
      })
    });

    await new Promise((r) => setTimeout(r, 200));

    const checkBDisabled = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const bDisData = parseEmails(await checkBDisabled.json());
    const countAfter = bDisData.length;
    assert(countAfter === countBefore, '9.1 No email forwarded when forwarding is disabled');

    // -------------------------------------------------------------
    // STEP 10: Manual Single Email Forwarding (/api/emails/:id/forward)
    // -------------------------------------------------------------
    console.log('\n--- STEP 10: Manual Single Email Forwarding ---');
    const u3 = `user_fwd_c_${Date.now()}`;
    const regCRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Charlie',
        lastName: 'ManualForward',
        username: u3,
        password: pwd,
        country: 'United States'
      })
    });
    const regC = await regCRes.json();
    const emailC = regC.user.email;

    // User A has an email in inbox, forward it manually to Charlie
    const inboxAForManual = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const aEmails = parseEmails(await inboxAForManual.json());
    assert(aEmails.length > 0, '10.1 User A has emails in inbox for manual forward');

    const emailToForward = aEmails[0];
    const manFwdRes = await fetch(`${baseUrl}/api/emails/${emailToForward.id}/forward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        to: emailC,
        note: 'Hey Charlie, please review this email.'
      })
    });
    const manFwdData = await manFwdRes.json();
    assert(manFwdRes.status === 200 && manFwdData.success === true, '10.2 Manual forward API succeeded', manFwdData);

    const inboxCRes = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${regC.token}` }
    });
    const cEmails = parseEmails(await inboxCRes.json());
    const charlieReceived = cEmails.find((e: any) => e.body_html?.includes('Hey Charlie') || e.body_text?.includes('Hey Charlie'));
    assert(Boolean(charlieReceived), '10.3 Charlie received the manually forwarded email with note');

    console.log(`\n=============================================================`);
    console.log(`🎉 AUTO-FORWARDING TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=============================================================`);

    server.close();
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err: any) {
    console.error('Fatal Auto-Forwarding Test Error:', err);
    server.close();
    process.exit(1);
  }
}

testAutoForwarding();
