import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

// 8-digit code ko email mein convert karo
function codeToEmail(code) {
  return `${code}@farazchat.app`;
}

// Naya account banao
export async function registerUser({ contactCode, password, displayName, bio }) {
  const email = codeToEmail(contactCode);
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await setDoc(doc(db, 'users', user.uid), {
    contactCode,
    displayName: displayName || '',
    bio: bio || '',
    avatarBase64: '',
    discoverable: true,
    notificationsEnabled: false,
    createdAt: serverTimestamp(),
  });

  return { uid: user.uid, contactCode, displayName, bio };
}

// Login karo
export async function loginUser({ contactCode, password }) {
  const email = codeToEmail(contactCode);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists()) {
    throw new Error('Profile not found.');
  }

  return { uid: user.uid, ...profileSnap.data() };
}

// Logout karo
export async function logoutUser() {
  await firebaseSignOut(auth);
}

// Auth state suno (app start hone par user check karne ke liye)
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
import { collection, query, where, getDocs } from 'firebase/firestore';

// Contact code available hai ya nahi check karo
export async function isCodeAvailable(contactCode) {
  try {
    const q = query(collection(db, 'users'), where('contactCode', '==', contactCode));
    const snapshot = await getDocs(q);
    return snapshot.empty; // true = available, false = taken
  } catch (error) {
    console.error('Code check error:', error);
    return true; // Error par available maan lo
  }
}