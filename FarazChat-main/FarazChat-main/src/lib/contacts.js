import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getUsersByIds } from './users';

export async function saveContact(ownerId, person, nickname) {
  try {
    const value = nickname.trim();
    if (!ownerId || !person?.id || !value) throw new Error('A contact and saved name are required.');
    await setDoc(doc(db, 'contacts', `${ownerId}_${person.id}`), {
      ownerId,
      contactId: person.id,
      nickname: value,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ...person, saved_as: value, nickname: value, display_name: value };
  } catch (error) {
    console.error('Contact save error:', error);
    throw new Error(error.message || 'Could not save this contact.');
  }
}

export function subscribeToContacts(ownerId, onContacts, onError) {
  try {
    const contactsQuery = query(collection(db, 'contacts'), where('ownerId', '==', ownerId));
    let version = 0;
    return onSnapshot(contactsQuery, async (snapshot) => {
      const currentVersion = ++version;
      try {
        const entries = snapshot.docs.map((item) => item.data());
        const people = await getUsersByIds(entries.map((item) => item.contactId));
        if (currentVersion !== version) return;
        const peopleById = new Map(people.map((person) => [person.id, person]));
        onContacts(entries.map((entry) => {
          const person = peopleById.get(entry.contactId);
          return person ? { ...person, nickname: entry.nickname, saved_as: entry.nickname, display_name: entry.nickname } : null;
        }).filter(Boolean));
      } catch (error) {
        console.error('Contact mapping error:', error);
        onError?.(new Error(error.message || 'Could not load saved contacts.'));
      }
    }, (error) => {
      console.error('Contact subscription error:', error);
      onError?.(new Error(error.message || 'Could not subscribe to contacts.'));
    });
  } catch (error) {
    console.error('Contact subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load saved contacts.'));
    return () => {};
  }
}