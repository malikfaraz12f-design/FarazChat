import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyB2Oj0ACO2Tkc6rU-42aENQOrfyUvRjJ_I",
  authDomain: "farazchat-2fdea.firebaseapp.com",
  projectId: "farazchat-2fdea",
  storageBucket: "farazchat-2fdea.firebasestorage.app",
  messagingSenderId: "372286305112",
  appId: "1:372286305112:web:9a42f6b0f56d4426112b2d"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Offline cache enable karo
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence enabled in first tab only');
  } else if (err.code === 'unimplemented') {
    console.warn('Browser does not support persistence');
  }
});
// Messaging — lazy load — sirf zaroorat par
export async function getMessagingInstance() {
  const { getMessaging, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
}
