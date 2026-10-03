import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getUsersByIds } from './users';

function toDate(value) {
  return value?.toDate?.() || new Date(0);
}

async function mapConversations(snapshot, userId) {
  const latestByPerson = new Map();
  snapshot.docs.forEach((messageDoc) => {
    const message = messageDoc.data();
    if (message.groupId || !message.participants?.includes(userId)) return;
    const otherId = message.senderId === userId ? message.recipientId : message.senderId;
    if (!otherId) return;
    const previous = latestByPerson.get(otherId);
    if (!previous || toDate(message.createdAt) > toDate(previous.createdAt)) {
      latestByPerson.set(otherId, { ...message, id: messageDoc.id });
    }
  });

  const [people, contactSnapshot] = await Promise.all([
    getUsersByIds([...latestByPerson.keys()]),
    getDocs(query(collection(db, 'contacts'), where('ownerId', '==', userId))),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const contactsById = new Map(contactSnapshot.docs.map((item) => [item.data().contactId, item.data()]));
  return [...latestByPerson.entries()].map(([personId, message]) => {
    const person = peopleById.get(personId) || { id: personId, username: 'Unknown user', display_name: 'Unknown user' };
    const contact = contactsById.get(personId);
    const date = toDate(message.createdAt);
    return {
      ...person,
      saved_as: contact?.nickname || '',
      display_name: contact?.nickname || person.display_name,
      last_message: message.body || '',
      last_message_at: date.toISOString(),
    };
  }).sort((left, right) => new Date(right.last_message_at) - new Date(left.last_message_at));
}

export function subscribeToConversations(userId, onConversations, onError) {
  try {
    const messagesQuery = query(collection(db, 'messages'), where('participants', 'array-contains', userId));
    let requestId = 0;
    return onSnapshot(messagesQuery, (snapshot) => {
      const currentRequest = ++requestId;
      mapConversations(snapshot, userId)
        .then((conversations) => {
          if (currentRequest === requestId) onConversations(conversations);
        })
        .catch((error) => {
          console.error('Conversation mapping error:', error);
          onError?.(new Error(error.message || 'Could not load conversations.'));
        });
    }, (error) => {
      console.error('Conversation subscription error:', error);
      onError?.(new Error(error.message || 'Could not subscribe to conversations.'));
    });
  } catch (error) {
    console.error('Conversation subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load conversations.'));
    return () => {};
  }
}

export async function getConversations(userId) {
  try {
    const messages = await getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', userId)));
    return await mapConversations(messages, userId);
  } catch (error) {
    console.error('Conversation load error:', error);
    throw new Error(error.message || 'Could not load conversations.');
  }
}