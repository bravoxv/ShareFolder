import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuración oficial del proyecto Firebase Sharefolder
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBGziAXy2AH0J6nFfu8lN744L7lRl3AC5k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sharefolder-7dccf.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sharefolder-7dccf",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sharefolder-7dccf.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "596160954279",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:596160954279:web:eb96018bb5d84709a60082",
  measurementId: "G-TP1V6FHC17"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
