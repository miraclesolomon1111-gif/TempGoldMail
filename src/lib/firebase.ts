// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDRWzRgWbAjVI-mYXGnLDc9Ea9ST2IGyiw",
  authDomain: "myassetpay-24c2d.firebaseapp.com",
  projectId: "myassetpay-24c2d",
  storageBucket: "myassetpay-24c2d.firebasestorage.app",
  messagingSenderId: "914618622784",
  appId: "1:914618622784:web:868b35828e4eb2419f50a5",
  measurementId: "G-4YPZR6HX9Z"
};

// Initialize Firebase
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch((err) => {
    console.debug("Firebase Analytics not initialized:", err);
  });
}

export default app;
