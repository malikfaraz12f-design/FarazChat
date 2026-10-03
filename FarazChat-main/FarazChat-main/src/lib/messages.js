import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

export function directConversationId(firstId, secondId) {
  try {
    return [firstId, secondId].sort().join('__');
  } catch (error) {
    console.error('Conversation ID error:', error);
    throw new Error('Could not identify this conversation.');
  }
}

function toMessage(snapshot) {
  const data = snapshot.data();
  const createdAt = data.createdAt?.toDate?.() || new Date();
  return {
    id: snapshot.id,
    ...data,
    sender_id: data.senderId,
    sender_username: data.senderContactCode || '',
    sender_display_name: data.senderDisplayName || '',
    group_id: data.groupId || null,
    created_at: createdAt.toISOString(),
    is_read: false,
    is_delivered: false,
  };
}

export function subscribeToMessages(chat, currentUser, onMessages, onError) {
  try {
    const messagesQuery = chat.kind === 'group'
      ? query(collection(db, 'messages'), where('groupId', '==', chat.id))
      : query(collection(db, 'messages'), where('conversationId', '==', directConversationId(currentUser.id, chat.id)));
    return onSnapshot(messagesQuery, (snapshot) => {
      const messages = snapshot.docs.map(toMessage)
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      onMessages(messages);
    }, (error) => {
      console.error('Message subscription error:', error);
      onError?.(new Error(error.message || 'Could not load messages.'));
    });
  } catch (error) {
    console.error('Message subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load messages.'));
    return () => {};
  }
}

export async function sendTextMessage({ chat, sender, body }) {
  try {
    const text = body.trim();
    if (!text) throw new Error('Write a message before sending.');
    const payload = {
      senderId: sender.id,
      senderDisplayName: sender.displayName || sender.display_name || '',
      senderContactCode: sender.contactCode || sender.contact_code || '',
      body: text,
      createdAt: serverTimestamp(),
    };
    if (chat.kind === 'group') {
      payload.groupId = chat.id;
      payload.participants = chat.memberIds || chat.members?.map((member) => member.id) || [sender.id];
    } else {
      payload.conversationId = directConversationId(sender.id, chat.id);
      payload.recipientId = chat.id;
      payload.participants = [sender.id, chat.id];
    }
    const reference = await addDoc(collection(db, 'messages'), payload);
    if (chat.kind === 'group') {
      await updateDoc(doc(db, 'groups', chat.id), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
      });
    }
    return { id: reference.id, ...payload, created_at: new Date().toISOString(), sender_id: sender.id, group_id: payload.groupId || null };
  } catch (error) {
    console.error('Message send error:', error);
    throw new Error(error.message || 'Could not send this message. Please try again.');
  }
}