importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyB2Oj0ACO2Tkc6rU-42aENQOrfyUvRjJ_I",
  authDomain: "farazchat-2fdea.firebaseapp.com",
  projectId: "farazchat-2fdea",
  storageBucket: "farazchat-2fdea.firebasestorage.app",
  messagingSenderId: "372286305112",
  appId: "1:372286305112:web:9a42f6b0f56d4426112b2d"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'FarazChat', {
    body: body || 'New message',
    icon: icon || '/farazchat-mark.svg',
  });
});
