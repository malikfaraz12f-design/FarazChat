import { db, auth } from '../firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export async function setTyping(chatId, isTyping) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const typingRef = doc(db, 'typing', `${chatId}_${currentUser.uid}`);
  await setDoc(typingRef, {
    userId: currentUser.uid,
    chatId,
    isTyping,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeToTyping(chatId, otherUserId, callback) {
  const typingRef = doc(db, 'typing', `${chatId}_${otherUserId}`);
  return onSnapshot(typingRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const updatedAt = data.updatedAt?.toDate?.() || new Date(0);
      const isRecent = Date.now() - updatedAt.getTime() < 3000;
      callback(isRecent && data.isTyping);
    } else {
      callback(false);
    }
  });
}
