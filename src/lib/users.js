import { auth, db } from '../firebase';
import { doc, getDoc, getDocs, collection, query, setDoc, serverTimestamp, where } from 'firebase/firestore';

export function normalizeUser(data, uid) {
  const userId = uid || data.id || data.uid;
  return {
    ...data,
    id: userId,
    uid: userId,
    username: data.contactCode || userId,
    display_name: data.displayName || data.contactCode || userId,
    contact_code: data.contactCode || '',
    avatar_url: data.avatarBase64 ? `data:image/jpeg;base64,${data.avatarBase64}` : '',
    notifications_enabled: Boolean(data.notificationsEnabled),
    allow_messages: data.allowMessages !== false,
    blocked_user_ids: Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [],
    last_seen: data.lastSeen || null,
    isDeveloper: Boolean(data.isDeveloper),
  };
}

export async function getMyProfile(uid = auth.currentUser?.uid) {
  try {
    if (!uid) throw new Error('You must be signed in to load a profile.');
    const profileSnap = await getDoc(doc(db, 'users', uid));
    if (!profileSnap.exists()) throw new Error('Profile not found.');
    return normalizeUser(profileSnap.data(), uid);
  } catch (error) {
    console.error('Profile load error:', error);
    throw new Error(error.message || 'Could not load your profile.');
  }
}

export async function updateUserProfile(profileOrUid, updates = {}) {
  try {
    const uid = typeof profileOrUid === 'string'
      ? profileOrUid
      : auth.currentUser?.uid || profileOrUid?.uid || profileOrUid?.id;
    if (!uid || uid !== auth.currentUser?.uid) {
      throw new Error('You can only update your own profile.');
    }
    const values = typeof profileOrUid === 'string' ? updates : profileOrUid;
    const allowedFields = [
      'displayName', 'bio', 'avatarBase64', 'notificationsEnabled',
      'discoverable', 'allowMessages', 'blockedUserIds', 'lastSeen',
    ];
    const profileUpdates = Object.fromEntries(
      allowedFields
        .filter((field) => Object.hasOwn(values || {}, field))
        .map((field) => [field, values[field]]),
    );
    await setDoc(doc(db, 'users', uid), {
      id: uid,
      ...profileUpdates,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return await getMyProfile(uid);
  } catch (error) {
    console.error('Profile update error:', error);
    throw new Error(error.message || 'Could not save your profile. Please try again.');
  }
}

export async function searchUserByCode(contactCode) {
  try {
    const q = query(
      collection(db, 'users'),
      where('contactCode', '==', contactCode),
      where('discoverable', '==', true),
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const result = snapshot.docs[0];
    return normalizeUser(result.data(), result.id);
  } catch (error) {
    console.error('User search error:', error);
    throw new Error(error.message || 'Could not search for that contact code.');
  }
}

export async function getUsersByIds(userIds) {
  try {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const snapshots = await Promise.all(uniqueIds.map((uid) => getDoc(doc(db, 'users', uid))));
    return snapshots.filter((snapshot) => snapshot.exists())
      .map((snapshot) => normalizeUser(snapshot.data(), snapshot.id));
  } catch (error) {
    console.error('User lookup error:', error);
    throw new Error(error.message || 'Could not load member profiles.');
  }
}