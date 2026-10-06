import { doc, updateDoc } from 'firebase/firestore';
import { db, auth, getMessagingInstance } from '../firebase';
const VAPID_KEY = 'BFJYFYuq0H3hvj6iksL1iZWPNaH_sRzwjpiluTgdlPRrySVUOy4M7auTd8CfsoXa-N5x4fNLrixzfbImt4iyrc8';
export async function requestNotificationPermission() {
  try {
    if (typeof Notification === 'undefined') {
      console.warn('Notification API not available');
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('Messaging not supported on this browser');
      return null;
    }
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token && auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        fcmToken: token,
        notificationsEnabled: true,
      });
    }
    return token;
  } catch (error) {
    console.error('FCM error:', error);
    return null;
  }
}
export function onForegroundMessage(callback) {
  return () => {};
}
