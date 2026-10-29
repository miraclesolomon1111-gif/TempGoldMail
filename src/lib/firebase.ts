// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  User as FirebaseUser
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs,
  Unsubscribe
} from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { EmailMessage, UserProfile, MailFolder } from "../types";

// Safe dynamic environment variable resolver
const getEnvVal = (key: string, fallback: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return String((import.meta as any).env[key]);
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return String(process.env[key]);
    }
  } catch {}
  return fallback;
};

// Your web app's Firebase configuration with env var fallbacks
export const firebaseConfig = {
  apiKey: getEnvVal("VITE_FIREBASE_API_KEY", "AIzaSyDRWzRgWbAjVI-mYXGnLDc9Ea9ST2IGyiw"),
  authDomain: getEnvVal("VITE_FIREBASE_AUTH_DOMAIN", "myassetpay-24c2d.firebaseapp.com"),
  projectId: getEnvVal("VITE_FIREBASE_PROJECT_ID", "myassetpay-24c2d"),
  storageBucket: getEnvVal("VITE_FIREBASE_STORAGE_BUCKET", "myassetpay-24c2d.firebasestorage.app"),
  messagingSenderId: getEnvVal("VITE_FIREBASE_MESSAGING_SENDER_ID", "914618622784"),
  appId: getEnvVal("VITE_FIREBASE_APP_ID", "1:914618622784:web:868b35828e4eb2419f50a5"),
  measurementId: getEnvVal("VITE_FIREBASE_MEASUREMENT_ID", "G-4YPZR6HX9Z")
};

// Initialize Firebase
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs
};

// 2. Set Firebase Auth Persistence: prune any old oversized localStorage cache first, then use IndexedDB
if (typeof window !== "undefined") {
  try {
    // Purge any bloated legacy email cache keys from localStorage to prevent quota exhaustion
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('goldmail_cached_emails_') || k.startsWith('cached_emails_'))) {
        localStorage.removeItem(k);
      }
    }
  } catch {}

  // Prefer indexedDBLocalPersistence (does not hit the 5MB localStorage quota)
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Firebase Auth persistence error:", err);
    });
  });
}

// Initialize Analytics safely
export let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

// Normalizer: ensure username or partial email maps to valid @goldmailer.xyz
export function normalizeGoldEmail(input: string): string {
  const clean = input.trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  return `${clean}@goldmailer.xyz`;
}

// Normalizer: extract username from email
export function getUsernameFromEmail(email: string): string {
  return email.replace(/@.*$/, "").trim().toLowerCase();
}

/**
 * Register user via Firebase Auth and persist profile to Firestore users/{uid}
 */
export async function firebaseRegister(data: {
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  country?: string;
}): Promise<{ user: UserProfile; firebaseUser: FirebaseUser }> {
  const cleanUsername = data.username.trim().toLowerCase().replace(/@.*$/, "");
  const email = `${cleanUsername}@goldmailer.xyz`;

  // 1. Create Firebase Auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, data.password);
  const fbUser = userCredential.user;
  const uid = fbUser.uid;

  // 2. Build profile matching UserProfile schema
  const profile: UserProfile = {
    id: uid,
    email,
    username: cleanUsername,
    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || cleanUsername,
    first_name: data.firstName || '',
    last_name: data.lastName || '',
    dob: data.dob || '1998-05-15',
    gender: data.gender || 'Prefer not to say',
    phone: data.phone || '',
    country: data.country || 'United States',
    role: 'user',
    created_at: new Date().toISOString(),
    plan: 'free',
    plan_status: 'active',
    storage_used_bytes: 0,
    storage_limit_bytes: 15 * 1024 * 1024 * 1024,
    forwarding_enabled: false,
    forwarding_email: '',
    forwarding_action: 'keep',
    forwarding_addresses: [],
    // Firebase requested single source of truth forwarding object:
    forwarding: {
      enabled: false,
      forwardTo: '',
      keepCopy: true
    }
  } as any;

  // 3. Save to Firestore users/{uid}
  await setDoc(doc(db, "users", uid), profile);

  // 4. Create initial welcome email in Firestore collection 'emails'
  try {
    const welcomeId = `msg_welcome_${Date.now()}`;
    await setDoc(doc(db, "emails", welcomeId), {
      id: welcomeId,
      userId: uid,
      to: email,
      recipient: email,
      from: 'welcome@goldmailer.xyz',
      sender: 'welcome@goldmailer.xyz',
      sender_name: 'GoldMailer Team',
      subject: 'Welcome to your permanent GoldMailer account!',
      body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; color: #18181b; border-radius: 12px; border: 1px solid #e4e4e7;">
        <h2 style="color: #FF6A00; margin-top: 0;">Welcome to GoldMailer! 🚀</h2>
        <p>Your permanent email address <strong>${email}</strong> has been created with <strong>15GB</strong> of secure cloud storage.</p>
        <p>Your account is powered by Firebase real-time persistence. Enjoy instant message delivery, Gmail-style auto-forwarding, and privacy protection.</p>
        <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="font-size: 12px; color: #71717a;">GoldMailer Security &amp; Communications Platform · goldmailer.xyz</p>
      </div>`,
      date: new Date().toISOString(),
      received_at: new Date().toISOString(),
      read: false,
      is_read: false,
      starred: false,
      is_starred: false,
      folder: 'primary',
      category: 'primary',
      status: 'inbox'
    });
  } catch (err) {
    console.warn("Failed to create welcome email in Firestore:", err);
  }

  return { user: profile, firebaseUser: fbUser };
}

/**
 * Login user via Firebase Auth signInWithEmailAndPassword only
 */
export async function firebaseLogin(identifier: string, password: string): Promise<{ user: UserProfile; firebaseUser: FirebaseUser }> {
  const email = normalizeGoldEmail(identifier);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const fbUser = userCredential.user;
  const uid = fbUser.uid;

  let profile = await fetchFirestoreUserProfile(uid);
  if (!profile) {
    // Self-heal profile doc if missing
    profile = {
      id: uid,
      email,
      username: getUsernameFromEmail(email),
      name: getUsernameFromEmail(email),
      role: 'user',
      created_at: new Date().toISOString(),
      forwarding_enabled: false,
      forwarding_email: '',
      forwarding: {
        enabled: false,
        forwardTo: '',
        keepCopy: true
      }
    } as UserProfile;
    await setDoc(doc(db, "users", uid), profile, { merge: true });
  }

  return { user: profile as UserProfile, firebaseUser: fbUser };
}

/**
 * Sign out from Firebase Auth
 */
export async function firebaseLogout(): Promise<void> {
  await signOut(auth);
}

/**
 * Fetch user profile from Firestore users/{uid}
 */
export async function fetchFirestoreUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const forwardingObj = data.forwarding || {
        enabled: Boolean(data.forwarding_enabled),
        forwardTo: data.forwarding_email || '',
        keepCopy: true
      };
      return {
        id: uid,
        email: data.email || '',
        username: data.username || (data.email ? getUsernameFromEmail(data.email) : 'user'),
        name: data.name || data.first_name || 'User',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        dob: data.dob,
        gender: data.gender,
        phone: data.phone,
        country: data.country,
        role: data.role || 'user',
        created_at: data.created_at || data.createdAt || new Date().toISOString(),
        forwarding_enabled: forwardingObj.enabled,
        forwarding_email: forwardingObj.forwardTo,
        forwarding_action: data.forwarding_action || 'keep',
        forwarding_addresses: data.forwarding_addresses || [],
        forwarding: forwardingObj,
        plan: data.plan || 'free',
        plan_status: data.plan_status || 'active',
        storage_used_bytes: data.storage_used_bytes || 0,
        storage_limit_bytes: data.storage_limit_bytes || 15 * 1024 * 1024 * 1024
      } as UserProfile;
    }
  } catch (err) {
    console.warn("Error reading Firestore user profile:", err);
  }
  return null;
}

/**
 * Save / Update forwarding settings in Firestore users/{uid}.forwarding = { enabled, forwardTo, keepCopy: true }
 */
export async function saveFirestoreForwarding(
  uid: string,
  forwarding: { enabled: boolean; forwardTo: string; keepCopy?: boolean; action?: string }
): Promise<void> {
  const forwardingData = {
    enabled: Boolean(forwarding.enabled),
    forwardTo: forwarding.forwardTo ? forwarding.forwardTo.trim().toLowerCase() : '',
    keepCopy: forwarding.keepCopy !== false
  };

  await setDoc(doc(db, "users", uid), {
    forwarding: forwardingData,
    forwarding_enabled: forwardingData.enabled,
    forwarding_email: forwardingData.forwardTo,
    ...(forwarding.action ? { forwarding_action: forwarding.action } : {})
  }, { merge: true });
}

/**
 * Save / Update verified forwarding addresses queue in Firestore users/{uid}.forwarding_addresses
 */
export async function saveFirestoreForwardingAddresses(
  uid: string,
  addresses: any[]
): Promise<void> {
  await setDoc(doc(db, "users", uid), {
    forwarding_addresses: addresses
  }, { merge: true });
}

/**
 * Real-time Email subscription: onSnapshot(query(collection(db, "emails"), where("userId", "==", uid)))
 */
export function subscribeToInboxEmails(
  uid: string,
  userEmail: string,
  onEmailsUpdated: (emails: EmailMessage[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  // Primary query requested by user: where("userId", "==", uid)
  const emailsQuery = query(
    collection(db, "emails"),
    where("userId", "==", uid)
  );

  return onSnapshot(
    emailsQuery,
    (snapshot) => {
      const emailList: EmailMessage[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const dateStr = d.date || d.received_at || d.created_at || new Date().toISOString();
        const toEmail = d.to || d.recipient || userEmail;
        const fromEmail = d.from || d.sender || 'unknown@goldmailer.xyz';
        const senderName = d.sender_name || fromEmail.replace(/@.*$/, '');

        emailList.push({
          id: docSnap.id,
          to: toEmail,
          recipient: toEmail,
          to_email: toEmail,
          from: fromEmail,
          sender: fromEmail,
          from_email: fromEmail,
          sender_name: senderName,
          subject: d.subject || '(No Subject)',
          body: d.body || d.body_html || d.body_text || '',
          body_html: d.body_html || d.body || '',
          body_text: d.body_text || (typeof d.body === 'string' ? d.body.replace(/<[^>]+>/g, '') : ''),
          date: dateStr,
          received_at: dateStr,
          created_at: dateStr,
          read: Boolean(d.read ?? d.is_read),
          is_read: Boolean(d.read ?? d.is_read),
          starred: Boolean(d.starred ?? d.is_starred),
          is_starred: Boolean(d.starred ?? d.is_starred),
          folder: (d.folder as MailFolder) || 'primary',
          category: d.category || 'primary',
          status: d.status || 'inbox',
          forwarded_from: d.forwarded_from,
          forwarded_to: d.forwarded_to
        });
      });

      // Sort newest first by date
      emailList.sort((a, b) => {
        const timeA = new Date(a.date || a.received_at || 0).getTime();
        const timeB = new Date(b.date || b.received_at || 0).getTime();
        return timeB - timeA;
      });

      onEmailsUpdated(emailList);
    },
    (err) => {
      console.warn("Firestore emails snapshot error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Send an email & store permanently in Firestore 'emails' collection
 */
export async function sendEmailToFirestore(payload: {
  userId: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): Promise<EmailMessage> {
  const emailId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // 1. Store sender copy in sent folder
  const sentDocData = {
    id: emailId,
    userId: payload.userId,
    to: payload.to.trim().toLowerCase(),
    recipient: payload.to.trim().toLowerCase(),
    from: payload.senderEmail.trim().toLowerCase(),
    sender: payload.senderEmail.trim().toLowerCase(),
    sender_name: payload.senderEmail.replace(/@.*$/, ''),
    subject: payload.subject.trim() || '(No Subject)',
    body: payload.body,
    body_html: payload.body,
    body_text: payload.body.replace(/<[^>]+>/g, ''),
    date: now,
    received_at: now,
    created_at: now,
    read: true,
    is_read: true,
    starred: false,
    is_starred: false,
    folder: 'sent',
    status: 'sent'
  };

  await setDoc(doc(db, "emails", emailId), sentDocData);

  // 2. If the recipient is registered in GoldMailer, deliver to recipient's inbox in Firestore
  try {
    const cleanTo = payload.to.trim().toLowerCase();
    const recipientUserQuery = query(collection(db, "users"), where("email", "==", cleanTo));
    const recipientSnapshot = await getDocs(recipientUserQuery);

    if (!recipientSnapshot.empty) {
      const recipientDoc = recipientSnapshot.docs[0];
      const recipientUid = recipientDoc.id;
      const recipientEmailId = `msg_${Date.now()}_rcv_${Math.random().toString(36).substring(2, 7)}`;

      await setDoc(doc(db, "emails", recipientEmailId), {
        id: recipientEmailId,
        userId: recipientUid,
        to: cleanTo,
        recipient: cleanTo,
        from: payload.senderEmail.trim().toLowerCase(),
        sender: payload.senderEmail.trim().toLowerCase(),
        sender_name: payload.senderEmail.replace(/@.*$/, ''),
        subject: payload.subject.trim() || '(No Subject)',
        body: payload.body,
        body_html: payload.body,
        body_text: payload.body.replace(/<[^>]+>/g, ''),
        date: now,
        received_at: now,
        created_at: now,
        read: false,
        is_read: false,
        starred: false,
        is_starred: false,
        folder: 'primary',
        category: 'primary',
        status: 'inbox'
      });
    }
  } catch (deliveryErr) {
    console.debug("Internal recipient delivery note:", deliveryErr);
  }

  return sentDocData as any;
}

/**
 * Update an email document in Firestore (read, starred, folder, etc.)
 */
export async function updateEmailInFirestore(emailId: string, updates: Partial<EmailMessage>): Promise<void> {
  const firestoreUpdates: any = {};
  if (updates.is_read !== undefined) {
    firestoreUpdates.read = updates.is_read;
    firestoreUpdates.is_read = updates.is_read;
  }
  if (updates.is_starred !== undefined) {
    firestoreUpdates.starred = updates.is_starred;
    firestoreUpdates.is_starred = updates.is_starred;
  }
  if (updates.folder !== undefined) {
    firestoreUpdates.folder = updates.folder;
    if (updates.folder === 'trash') {
      firestoreUpdates.status = 'trash';
      firestoreUpdates.trashed_at = new Date().toISOString();
    } else {
      firestoreUpdates.status = 'inbox';
    }
  }

  try {
    await setDoc(doc(db, "emails", emailId), firestoreUpdates, { merge: true });
  } catch (err) {
    console.warn("updateEmailInFirestore note:", err);
  }
}

/**
 * Permanently delete or move email to trash in Firestore
 */
export async function deleteEmailInFirestore(emailId: string, permanent: boolean = false): Promise<void> {
  try {
    if (permanent) {
      await deleteDoc(doc(db, "emails", emailId));
    } else {
      await setDoc(doc(db, "emails", emailId), {
        folder: 'trash',
        status: 'trash',
        trashed_at: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {
    console.warn("deleteEmailInFirestore note:", err);
  }
}

/**
 * Change authenticated user's password securely in Firebase Auth
 */
export async function firebaseChangePassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error("No active Firebase session found. Please sign in to change your password.");
  }
  await updatePassword(auth.currentUser, newPassword);
}

/**
 * Send password reset email via Firebase Auth
 */
export async function firebaseSendPasswordReset(email: string): Promise<void> {
  const clean = normalizeGoldEmail(email);
  await sendPasswordResetEmail(auth, clean);
}

export default app;
