import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

// 8-digit code se user dhoondo
export async function searchUserByCode(contactCode) {
  const q = query(
    collection(db, 'users'),
    where('contactCode', '==', contactCode),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  };
}