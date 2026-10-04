import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const VAPID_KEY = 'BPVMFny-4skIwQEBn7kgJMSryl-EFTQ5MG5T8ECq9JBWZllSUNWXlysQ_v4HLrteHfIHA6FJEqh6EOVEoRHObp8';

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const messaging = getMessaging();
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
  const messaging = getMessaging();
  return onMessage(messaging, callback);
}
