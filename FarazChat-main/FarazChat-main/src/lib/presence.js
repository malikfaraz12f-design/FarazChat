import { Timestamp, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function updateLastSeen(userId) {
  try {
    if (!userId) return;
    await setDoc(doc(db, 'users', userId), { id: userId, lastSeen: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Presence update error:', error);
    throw new Error(error.message || 'Could not update online status.');
  }
}

export function subscribeToOnlineUsers(onOnlineUsers, onError) {
  try {
    let stopCurrent = () => {};
    let active = true;
    const subscribe = () => {
      stopCurrent();
      const cutoff = Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
      const onlineQuery = query(collection(db, 'users'), where('lastSeen', '>', cutoff));
      stopCurrent = onSnapshot(onlineQuery, (snapshot) => {
        if (active) onOnlineUsers(new Set(snapshot.docs.map((item) => item.id)));
      }, (error) => {
        console.error('Presence subscription error:', error);
        onError?.(new Error(error.message || 'Could not subscribe to online status.'));
      });
    };
    subscribe();
    const timer = setInterval(subscribe, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
      stopCurrent();
    };
  } catch (error) {
    console.error('Presence subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load online status.'));
    return () => {};
  }
}