import { Capacitor } from '@capacitor/core';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
const VAPID_KEY = 'BFJYFYuq0H3hvj6iksL1iZWPNaH_sRzwjpiluTgdlPRrySVUOy4M7auTd8CfsoXa-N5x4fNLrixzfbImt4iyrc8';
export async function requestNotificationPermission() {
  try {
    if (Capacitor.isNativePlatform()) {
      // Native platform (APK) — Capacitor Push Notifications
      const { PushNotifications } = await import('@capacitor/push-notifications');
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return null;
      }
      await PushNotifications.register();
      return new Promise((resolve) => {
        PushNotifications.addListener('registration', async (token) => {
          if (token.value && auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              fcmToken: token.value,
              notificationsEnabled: true,
            });
          }
          resolve(token.value);
        });
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
          resolve(null);
        });
      });
    } else {
      // Web platform (browser) — FCM Web SDK
      if (typeof Notification === 'undefined') {
        console.warn('Notification API not available');
        return null;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
      const supported = await isSupported();
      if (!supported) return null;
      const { app } = await import('../firebase');
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token && auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          fcmToken: token,
          notificationsEnabled: true,
        });
      }
      return token;
    }
  } catch (error) {
    console.error('FCM error:', error);
    return null;
  }
}
export function onForegroundMessage(callback) {
  return () => {};
}
