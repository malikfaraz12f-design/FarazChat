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
    if (message.groupId) return;
    const senderId = message.senderId || message.sender_id;
    const recipientId = message.recipientId || message.recipient_id;
    const otherId = senderId === userId
      ? recipientId
      : recipientId === userId
        ? senderId
        : message.participants?.find((participantId) => participantId !== userId);
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
    const messagesQueries = [
      query(collection(db, 'messages'), where('participants', 'array-contains', userId)),
      query(collection(db, 'messages'), where('senderId', '==', userId)),
      query(collection(db, 'messages'), where('recipientId', '==', userId)),
    ];
    const snapshots = messagesQueries.map(() => new Map());
    let requestId = 0;
    const unsubscribes = messagesQueries.map((messagesQuery, index) => onSnapshot(messagesQuery, (snapshot) => {
      snapshots[index] = new Map(snapshot.docs.map((item) => [item.id, item]));
      const uniqueMessages = new Map();
      snapshots.forEach((items) => items.forEach((item, id) => uniqueMessages.set(id, item)));
      const currentRequest = ++requestId;
      mapConversations({ docs: [...uniqueMessages.values()] }, userId)
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
    }))
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  } catch (error) {
    console.error('Conversation subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load conversations.'));
    return () => {};
  }
}

export async function getConversations(userId) {
  try {
    const messageQueries = [
      query(collection(db, 'messages'), where('participants', 'array-contains', userId)),
      query(collection(db, 'messages'), where('senderId', '==', userId)),
      query(collection(db, 'messages'), where('recipientId', '==', userId)),
    ];
    const snapshots = await Promise.all(messageQueries.map((messagesQuery) => getDocs(messagesQuery)));
    const uniqueMessages = new Map();
    snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => uniqueMessages.set(item.id, item)));
    return await mapConversations({ docs: [...uniqueMessages.values()] }, userId);
  } catch (error) {
    console.error('Conversation load error:', error);
    throw new Error(error.message || 'Could not load conversations.');
  }
}