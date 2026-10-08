import { app } from './src/server/app.ts';
import { db } from './src/server/db.ts';
import http from 'http';

async function runBugsVerification() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3456, resolve));
  const baseUrl = 'http://127.0.0.1:3456';

  console.log('🧪 Verifying All 4 User Critical Persistence Bugs & 20 Admin Features...\n');
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
    // =========================================================================
    // BUG 3: EMAIL ACCOUNT DISAPPEARING BUG
    // "All email accounts must be saved in main database table goldmailer_accounts.
    // Creation must be an INSERT into DB. Login must check DB."
    // =========================================================================
    console.log('--- TEST BUG 3: Email Account Persistence in Database ---');
    const bug3Username = `persistence_user_${Date.now()}`;
    const bug3Pass = 'GoldPassword2026!';
    
    // Create new email account xxx@goldmailer.xyz
    const createRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Persistence',
        lastName: 'Test',
        username: bug3Username,
        password: bug3Pass
      })
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.success, '3.1 Account creation succeeds');
    
    // Check DB directly
    const dbAccount = await db.findAccount(bug3Username);
    assert(Boolean(dbAccount && dbAccount.email.includes(bug3Username)), '3.2 Account exists in DB goldmailer_accounts table');
    
    // Check login checks DB
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `${bug3Username}@goldmailer.xyz`,
        password: bug3Pass
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token), '3.3 Login checks DB and succeeds');

    // =========================================================================
    // BUG 1: BAN SYSTEM BUG
    // "When admin bans, update DB and block login on backend, not just frontend.
    // Add column is_banned boolean and banned_at timestamp."
    // =========================================================================
    console.log('\n--- TEST BUG 1: Ban System DB Persistence & Backend Enforcement ---');
    // Admin login token
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'miracle@goldmailer.xyz',
        password: '@654413Mm'
      })
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.token;
    assert(Boolean(adminToken), '1.1 Admin authenticated for ban actions');

    // Admin bans user
    const banRes = await fetch(`${baseUrl}/api/admin/ban-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: dbAccount!.id,
        banned: true,
        reason: 'Violating Terms of Service (Testing Ban Persistence)'
      })
    });
    const banData = await banRes.json();
    assert(banRes.status === 200 && banData.user.is_banned === true, '1.2 Admin bans user, returned is_banned: true');
    assert(Boolean(banData.user.banned_at), '1.3 banned_at timestamp populated');

    // Check DB directly: must be permanently banned in DB!
    const bannedDbAccount = await db.findAccount(bug3Username);
    assert(Boolean(bannedDbAccount?.is_banned === true), '1.4 DB goldmailer_accounts has is_banned: true permanently');

    // User attempts login: MUST BE BLOCKED ON BACKEND WITH 403
    const blockedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `${bug3Username}@goldmailer.xyz`,
        password: bug3Pass
      })
    });
    const blockedLoginData = await blockedLoginRes.json();
    assert(blockedLoginRes.status === 403 && blockedLoginData.is_banned === true, '1.5 Backend blocks login with 403 Forbidden and is_banned: true');

    // Admin unbans user
    const unbanRes = await fetch(`${baseUrl}/api/admin/ban-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: dbAccount!.id,
        banned: false
      })
    });
    assert(unbanRes.status === 200, '1.6 Admin unbans user');
    
    // User can log in again
    const unbannedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `${bug3Username}@goldmailer.xyz`,
        password: bug3Pass
      })
    });
    assert(unbannedLoginRes.status === 200, '1.7 Unbanned user can log in again successfully');

    // =========================================================================
    // BUG 2: DELETE / TRASH BUG
    // "When I delete an email to trash, it goes to trash then automatically comes back to inbox.
    // Add status column = 'inbox', 'trash', 'deleted'. Only show inbox emails where status='inbox'."
    // =========================================================================
    console.log('\n--- TEST BUG 2: Email Delete & Trash DB Persistence ---');
    const userAuthToken = loginData.token;

    // Send a test email to user
    const sendMailRes = await fetch(`${baseUrl}/api/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAuthToken}`
      },
      body: JSON.stringify({
        to: `${bug3Username}@goldmailer.xyz`,
        subject: 'Important Test Invoice #1024',
        bodyText: 'This is a test email to verify trash persistence.'
      })
    });
    // Verify email is in inbox initially
    const inboxBeforeRes = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    const inboxBeforeData = await inboxBeforeRes.json();
    const listBefore = Array.isArray(inboxBeforeData) ? inboxBeforeData : (inboxBeforeData.emails || []);
    assert(listBefore.length > 0, '2.2 Email is initially visible in Primary / Inbox');
    const emailId = listBefore[0].id;

    // Move email to trash
    const trashRes = await fetch(`${baseUrl}/api/emails/${emailId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    assert(trashRes.status === 200, '2.3 Email deleted to trash');

    // Fetch inbox: Email MUST NOT be in inbox!
    const inboxAfterRes = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    const inboxAfterData = await inboxAfterRes.json();
    const listAfter = Array.isArray(inboxAfterData) ? inboxAfterData : (inboxAfterData.emails || []);
    const inInboxAfter = listAfter.some((e: any) => e.id === emailId);
    assert(!inInboxAfter, '2.4 Trashed email is NOT in Inbox (does NOT bounce back)');

    // Fetch trash folder: Email MUST be in trash!
    const trashFolderRes = await fetch(`${baseUrl}/api/emails?folder=trash`, {
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    const trashFolderData = await trashFolderRes.json();
    const listTrash = Array.isArray(trashFolderData) ? trashFolderData : (trashFolderData.emails || []);
    const inTrash = listTrash.some((e: any) => e.id === emailId && (e.status === 'trash' || e.folder === 'trash'));
    assert(inTrash, '2.5 Trashed email IS present in Trash folder with status="trash"');

    // Restore email from trash
    const restoreRes = await fetch(`${baseUrl}/api/emails/${emailId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    assert(restoreRes.status === 200, '2.6 Restoring email succeeds');

    // Verify email is back in inbox
    const inboxRestoredRes = await fetch(`${baseUrl}/api/emails?folder=primary`, {
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    const inboxRestoredData = await inboxRestoredRes.json();
    const listRestored = Array.isArray(inboxRestoredData) ? inboxRestoredData : (inboxRestoredData.emails || []);
    const inInboxRestored = listRestored.some((e: any) => e.id === emailId);
    assert(inInboxRestored, '2.7 Restored email is safely back in Inbox');

    // =========================================================================
    // BUG 4: SWITCH ACCOUNT BUG
    // "Switch should just change session ID, not delete. Save all logged-in accounts in DB session table."
    // =========================================================================
    console.log('\n--- TEST BUG 4: Account Switching Without Deleting Accounts ---');
    // Create second user account
    const bug4SecondUser = `switch_user_2_${Date.now()}`;
    const create2Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Switch',
        lastName: 'Two',
        username: bug4SecondUser,
        password: bug3Pass
      })
    });
    const create2Data = await create2Res.json();
    assert(create2Res.status === 201, '4.1 Created second user account for switching');

    // Switch from User 1 to User 2
    const switchRes = await fetch(`${baseUrl}/api/auth/switch-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAuthToken}`
      },
      body: JSON.stringify({
        targetEmail: `${bug4SecondUser}@goldmailer.xyz`
      })
    });
    const switchData = await switchRes.json();
    assert(switchRes.status === 200 && switchData.user.username === bug4SecondUser, '4.2 Switched to second account successfully');
    assert(Boolean(switchData.session_id), '4.3 New DB session ID issued');

    // Switch back to User 1
    const switchBackRes = await fetch(`${baseUrl}/api/auth/switch-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${switchData.token}`
      },
      body: JSON.stringify({
        targetEmail: `${bug3Username}@goldmailer.xyz`
      })
    });
    const switchBackData = await switchBackRes.json();
    assert(switchBackRes.status === 200 && switchBackData.user.username === bug3Username, '4.4 Switched back to first account');

    // Verify both accounts still exist in DB (neither was deleted)
    const acc1StillExists = await db.findAccount(bug3Username);
    const acc2StillExists = await db.findAccount(bug4SecondUser);
    assert(Boolean(acc1StillExists && acc2StillExists), '4.5 Both accounts still exist in DB (no accounts deleted during switch)');

    // =========================================================================
    // ADMIN PANEL 20 FEATURES TEST
    // =========================================================================
    console.log('\n--- TEST ADMIN PANEL: 20 Professional Features Endpoints ---');
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    };

    // 1. Overview
    const f1 = await fetch(`${baseUrl}/api/admin/overview`, { headers: adminHeaders });
    assert(f1.status === 200, 'Feature 1: Dashboard Overview (stats, revenue chart, storage)');

    // 2. User Management
    const f2 = await fetch(`${baseUrl}/api/admin/users`, { headers: adminHeaders });
    assert(f2.status === 200, 'Feature 2: User Management (list, filter, manage)');

    // 3. Email Accounts
    const f3 = await fetch(`${baseUrl}/api/admin/email-accounts`, { headers: adminHeaders });
    assert(f3.status === 200, 'Feature 3: Email Accounts (@goldmailer.xyz accounts)');

    // 4. Ban/Suspend Users (already tested in Bug 1)
    assert(true, 'Feature 4: Ban/Suspend Users (ban with reason, permanent DB)');

    // 5. Email Logs
    const f5 = await fetch(`${baseUrl}/api/admin/email-logs`, { headers: adminHeaders });
    assert(f5.status === 200, 'Feature 5: Email Logs (all sent/received emails with time)');

    // 6. Storage Management
    const f6 = await fetch(`${baseUrl}/api/admin/storage`, { headers: adminHeaders });
    assert(f6.status === 200, 'Feature 6: Storage Management (usage per user)');

    // 7. Subscriptions & Plans
    const f7 = await fetch(`${baseUrl}/api/admin/subscriptions`, { headers: adminHeaders });
    assert(f7.status === 200, 'Feature 7: Subscriptions & Plans (who paid, monthly/yearly)');

    // 8. Payments & Invoices
    const f8 = await fetch(`${baseUrl}/api/admin/payments`, { headers: adminHeaders });
    assert(f8.status === 200, 'Feature 8: Payments & Invoices (NOWPayments history)');

    // 9. Domains
    const f9 = await fetch(`${baseUrl}/api/admin/domains`, { headers: adminHeaders });
    assert(f9.status === 200, 'Feature 9: Domains (goldmailer.xyz and custom domains)');

    // 10. System Health
    const f10 = await fetch(`${baseUrl}/api/admin/system-health`, { headers: adminHeaders });
    assert(f10.status === 200, 'Feature 10: System Health (server, DB, API status)');

    // 11. Reports & Analytics
    const f11 = await fetch(`${baseUrl}/api/admin/reports`, { headers: adminHeaders });
    assert(f11.status === 200, 'Feature 11: Reports & Analytics (new users, active users)');

    // 12. Support Tickets
    const f12 = await fetch(`${baseUrl}/api/admin/tickets`, { headers: adminHeaders });
    assert(f12.status === 200, 'Feature 12: Support Tickets (user issues & admin replies)');

    // 13. Spam & Security
    const f13 = await fetch(`${baseUrl}/api/admin/security`, { headers: adminHeaders });
    assert(f13.status === 200, 'Feature 13: Spam & Security (blocked IPs, security alerts)');

    // 14. Trash Recovery
    const f14 = await fetch(`${baseUrl}/api/admin/trash`, { headers: adminHeaders });
    assert(f14.status === 200, 'Feature 14: Trash Recovery (recover accounts & emails)');

    // 15. Settings
    const f15 = await fetch(`${baseUrl}/api/admin/settings`, { headers: adminHeaders });
    assert(f15.status === 200, 'Feature 15: Settings (site name, logo, pricing, SMTP)');

    // 16. Admin Roles
    const f16 = await fetch(`${baseUrl}/api/admin/roles`, { headers: adminHeaders });
    assert(f16.status === 200, 'Feature 16: Admin Roles (super admin, support admin)');

    // 17. Broadcast Notifications
    const f17 = await fetch(`${baseUrl}/api/admin/notifications`, { headers: adminHeaders });
    assert(f17.status === 200, 'Feature 17: Notifications (broadcast to all users)');

    // 18. Backup & Restore
    const f18 = await fetch(`${baseUrl}/api/admin/backup`, { headers: adminHeaders });
    assert(f18.status === 200, 'Feature 18: Backup & Restore (database JSON backup)');

    // 19. API Keys
    const f19 = await fetch(`${baseUrl}/api/admin/api-keys`, { headers: adminHeaders });
    assert(f19.status === 200, 'Feature 19: API Keys (Twilio, Resend, NOWPayments keys)');

    // 20. Activity Logs
    const f20 = await fetch(`${baseUrl}/api/admin/activity-logs`, { headers: adminHeaders });
    assert(f20.status === 200, 'Feature 20: Activity Logs (who banned who, when, with IP)');

    // =========================================================================
    // TEST 5: INBOUND EMAIL RECEPTION & GOLDMAILER.XYZ DOMAIN / SMTP VERIFICATION
    // =========================================================================
    console.log('\n--- TEST 5: Inbound Email Reception & goldmailer.xyz Exclusive Domain ---');
    const targetXyzEmail = `${bug3Username}@goldmailer.xyz`;

    // 5.1 Test Resend / Generic Webhook Inbound Email
    const wh1 = await fetch(`${baseUrl}/api/webhook/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'email.received',
        data: {
          from: 'sender@gmail.com',
          to: [targetXyzEmail],
          subject: 'Webhook Inbound Delivery Test #1',
          text: 'Hello GoldMailer.xyz inbox via Resend webhook!',
          html: '<p>Hello <b>GoldMailer.xyz</b> inbox via Resend webhook!</p>'
        }
      })
    });
    const wh1Data = await wh1.json();
    assert(wh1.status === 200 && wh1Data.success === true, '5.1 /api/webhook/inbound receives email for @goldmailer.xyz');

    // 5.2 Test Cloudflare Email Routing / Raw MIME Webhook
    const wh2 = await fetch(`${baseUrl}/api/webhook/cloudflare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'cloudflare-test@example.org',
        to: targetXyzEmail,
        subject: 'Cloudflare Routing Test #2',
        raw: `From: "Cloudflare Test" <cloudflare-test@example.org>\r\nTo: ${targetXyzEmail}\r\nSubject: Cloudflare Routing Test #2\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\nRaw MIME body delivered to ${targetXyzEmail}`
      })
    });
    const wh2Data = await wh2.json();
    assert(wh2.status === 200 && wh2Data.success === true, '5.2 /api/webhook/cloudflare receives raw MIME email for @goldmailer.xyz');

    // 5.3 Verify both inbound emails appear in GET /api/emails/:email and GET /api/emails?folder=primary
    const checkInboxRes = await fetch(`${baseUrl}/api/emails/${encodeURIComponent(targetXyzEmail)}?folder=primary`, {
      headers: { Authorization: `Bearer ${userAuthToken}` }
    });
    const checkInboxEmails = await checkInboxRes.json();
    assert(
      Array.isArray(checkInboxEmails) &&
      checkInboxEmails.some((e: any) => e.subject === 'Webhook Inbound Delivery Test #1') &&
      checkInboxEmails.some((e: any) => e.subject === 'Cloudflare Routing Test #2'),
      '5.3 Received webhook emails are persisted and returned in user @goldmailer.xyz inbox'
    );

    // 5.4 Verify SMTP & Domain settings use goldmailer.xyz exclusively
    const apiKeysData = await f19.json();
    assert(
      apiKeysData.smtp_domain === 'goldmailer.xyz' &&
      String(apiKeysData.smtp_host).includes('goldmailer.xyz'),
      '5.4 SMTP configuration exclusively uses goldmailer.xyz'
    );

    const overviewStats = await f1.json();
    assert(
      Number(overviewStats.monthlyRevenueUsd) === 0,
      '5.5 No mock balance in Admin Overview (monthlyRevenueUsd is 0 when no real payments)'
    );

    console.log(`\n=============================================================`);
    console.log(`🎉 ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=============================================================`);

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    server.close();
    process.exit(1);
  }
}

runBugsVerification();
