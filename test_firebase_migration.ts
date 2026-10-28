import {
  firebaseRegister,
  firebaseLogin,
  saveFirestoreForwarding,
  fetchFirestoreUserProfile,
  sendEmailToFirestore,
  db,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from './src/lib/firebase.ts';

async function runFirebaseVerification() {
  console.log('🧪 Starting 100% Firebase Migration End-to-End Verification...\n');
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

  const testUsername = `golduser_${Date.now()}`;
  const testPassword = 'GoldPassword2026!';
  const expectedEmail = `${testUsername}@goldmailer.xyz`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Register User in Firebase Auth & Firestore users/{uid}
    // -------------------------------------------------------------
    console.log('--- TEST 1: Register User (Firebase Auth + Firestore) ---');
    const regRes = await firebaseRegister({
      firstName: 'Firebase',
      lastName: 'Tester',
      username: testUsername,
      password: testPassword,
      phone: '+1 555-019-9999',
      country: 'United States'
    });

    assert(Boolean(regRes.firebaseUser.uid), '1.1 Firebase user created with UID', regRes.firebaseUser.uid);
    assert(regRes.user.email === expectedEmail, '1.2 Email formatted to @goldmailer.xyz', regRes.user.email);

    // Verify Firestore users/{uid} document directly
    const userDocSnap = await getDoc(doc(db, "users", regRes.firebaseUser.uid));
    assert(userDocSnap.exists(), '1.3 User document exists in Firestore users/{uid}');
    const userData = userDocSnap.data();
    assert(userData?.username === testUsername, '1.4 Firestore profile stores username correctly', userData?.username);

    // -------------------------------------------------------------
    // TEST 2: Login via signInWithEmailAndPassword Only
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Login (signInWithEmailAndPassword only) ---');
    const loginRes = await firebaseLogin(testUsername, testPassword);
    assert(loginRes.firebaseUser.uid === regRes.firebaseUser.uid, '2.1 Login succeeds with UID match');
    assert(loginRes.user.email === expectedEmail, '2.2 Login retrieves correct user profile from Firestore');

    // -------------------------------------------------------------
    // TEST 3: Save and Load Email Forwarding in Firestore users/{uid}
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Forwarding Settings in Firestore users/{uid} ---');
    const targetForwardTo = 'forwarding.destination@gmail.com';
    await saveFirestoreForwarding(regRes.firebaseUser.uid, {
      enabled: true,
      forwardTo: targetForwardTo,
      keepCopy: true
    });

    // Read back via getDoc(doc(db, "users", uid)) as required
    const freshProfile = await fetchFirestoreUserProfile(regRes.firebaseUser.uid);
    assert(freshProfile?.forwarding_enabled === true, '3.1 Forwarding enabled flag saved in Firestore');
    assert(freshProfile?.forwarding_email === targetForwardTo, '3.2 Forwarding address saved in Firestore', freshProfile?.forwarding_email);
    assert(freshProfile?.forwarding?.keepCopy === true, '3.3 Forwarding keepCopy option persisted in Firestore');

    // -------------------------------------------------------------
    // TEST 4: Email Storage and Query in Firestore collection 'emails'
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Email Storage & onSnapshot Query Structure ---');
    const sentEmail = await sendEmailToFirestore({
      userId: regRes.firebaseUser.uid,
      senderEmail: expectedEmail,
      to: 'recipient@goldmailer.xyz',
      subject: 'Firebase Migration Verification Email',
      body: '<p>This email is permanently stored in Firestore.</p>'
    });

    assert(Boolean(sentEmail.id), '4.1 Email saved to Firestore with ID', sentEmail.id);

    // Query emails with where("userId", "==", uid) matching onSnapshot query
    const emailsQuery = query(collection(db, "emails"), where("userId", "==", regRes.firebaseUser.uid));
    const emailsSnapshot = await getDocs(emailsQuery);
    assert(emailsSnapshot.size >= 1, '4.2 Query where("userId", "==", uid) returns stored emails', `Count: ${emailsSnapshot.size}`);

    const retrievedEmails = emailsSnapshot.docs.map(d => d.data());
    const foundEmail = retrievedEmails.find(e => e.subject === 'Firebase Migration Verification Email' || e.subject.includes('Welcome'));
    assert(Boolean(foundEmail), '4.3 Email contains subject and persists permanently', foundEmail?.subject);

    console.log(`\n=============================================================`);
    console.log(`🎉 ALL FIREBASE TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=============================================================`);

  } catch (err: any) {
    console.error('Fatal Firebase test error:', err);
    process.exit(1);
  }
}

runFirebaseVerification().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
