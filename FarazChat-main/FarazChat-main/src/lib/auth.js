import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getMyProfile } from './users';

function codeToEmail(code) {
  return `${code}@farazchat.app`;
}

export async function registerUser({ contactCode, password, displayName, bio }) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, codeToEmail(contactCode), password);
    const uid = credential.user.uid;
    const profile = {
      id: uid,
      contactCode,
      displayName: displayName || '',
      bio: bio || '',
      avatarBase64: '',
      discoverable: true,
      notificationsEnabled: false,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', uid), profile);
    return { ...profile, uid };
  } catch (error) {
    console.error('Registration error:', error);
    throw new Error(error.message || 'Could not create your account. Please try again.');
  }
}

export async function loginUser({ contactCode, password }) {
  try {
    const credential = await signInWithEmailAndPassword(auth, codeToEmail(contactCode), password);
    return await getMyProfile(credential.user.uid);
  } catch (error) {
    console.error('Login error:', error);
    throw new Error(error.message || 'Could not sign in. Please try again.');
  }
}

export async function logoutUser() {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign out error:', error);
    throw new Error(error.message || 'Could not sign out. Please try again.');
  }
}

export async function changeUserPassword(currentPassword, newPassword) {
  try {
    const user = auth.currentUser;
    if (!user?.email) throw new Error('You must be signed in to change your password.');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  } catch (error) {
    console.error('Password update error:', error);
    throw new Error(error.message || 'Could not update your password.');
  }
}

export function onAuthChange(callback) {
  try {
    return onAuthStateChanged(auth, callback);
  } catch (error) {
    console.error('Auth listener error:', error);
    throw new Error(error.message || 'Could not monitor your sign-in state.');
  }
}

export async function isCodeAvailable(contactCode) {
  try {
    const usersQuery = query(collection(db, 'users'), where('contactCode', '==', contactCode));
    const snapshot = await getDocs(usersQuery);
    return snapshot.empty;
  } catch (error) {
    console.error('Code check error:', error);
    return false;
  }
}