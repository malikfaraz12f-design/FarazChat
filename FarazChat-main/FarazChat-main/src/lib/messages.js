import { addDoc, collection, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
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
  const createdAt = data.createdAt?.toDate?.() || (data.created_at ? new Date(data.created_at) : new Date());
  const senderId = data.senderId || data.sender_id;
  return {
    id: snapshot.id,
    ...data,
    sender_id: senderId,
    sender_username: data.senderContactCode || data.sender_username || '',
    sender_display_name: data.senderDisplayName || data.sender_display_name || '',
    group_id: data.groupId || data.group_id || null,
    created_at: createdAt.toISOString(),
    read: Boolean(data.read),
    is_read: Boolean(data.read),
    is_delivered: false,
  };
}

function matchesDirectChat(data, currentUserId, chatId) {
  const senderId = data.senderId || data.sender_id;
  const recipientId = data.recipientId || data.recipient_id;
  const conversationId = data.conversationId || data.conversation_id || directConversationId(currentUserId, chatId);
  return !data.groupId && !data.group_id && (
    (senderId === currentUserId && recipientId === chatId) ||
    (senderId === chatId && recipientId === currentUserId) ||
    conversationId === directConversationId(currentUserId, chatId)
  );
}

export function subscribeToMessages(chat, currentUser, onMessages, onError) {
  try {
    const reportError = (queryName, error) => {
      console.error(`Message subscription error (${queryName}):`, error.code, error);
      onError?.(new Error(`${error.code || 'firestore/error'}: ${error.message || 'Could not load messages.'}`));
    };
    if (chat.kind === 'group') {
      const groupQuery = query(collection(db, 'messages'), where('groupId', '==', chat.id));
      return onSnapshot(groupQuery, (snapshot) => {
        onMessages(snapshot.docs.map(toMessage)
          .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)));
      }, (error) => reportError('groupId', error));
    }

    const directMessagesQueries = [
      query(collection(db, 'messages'), where('senderId', '==', currentUser.id)),
      query(collection(db, 'messages'), where('recipientId', '==', currentUser.id)),
    ];
    const snapshots = directMessagesQueries.map(() => new Map());
    const unsubscribes = directMessagesQueries.map((directMessagesQuery, index) => onSnapshot(directMessagesQuery, (snapshot) => {
      snapshots[index] = new Map(snapshot.docs.map((item) => [item.id, item]));
      const uniqueMessages = new Map();
      snapshots.forEach((items) => items.forEach((item, id) => uniqueMessages.set(id, item)));
      const matches = [...uniqueMessages.values()]
        .filter((item) => matchesDirectChat(item.data(), currentUser.id, chat.id))
        .map(toMessage)
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      onMessages(matches);
    }, (error) => reportError('senderId/recipientId', error)));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  } catch (error) {
    console.error('Message subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load messages.'));
    return () => {};
  }
}

export async function markMessagesAsRead(messages, currentUserId, chatId) {
  try {
    const unreadMessages = messages.filter((message) => {
      const senderId = message.senderId || message.sender_id;
      const recipientId = message.recipientId || message.recipient_id;
      return message.read !== true
        && senderId !== currentUserId
        && recipientId === currentUserId
        && senderId === chatId;
    });

    for (let offset = 0; offset < unreadMessages.length; offset += 450) {
      const batch = writeBatch(db);
      unreadMessages.slice(offset, offset + 450).forEach((message) => {
        batch.update(doc(db, 'messages', message.id), { read: true });
      });
      await batch.commit();
    }
  } catch (error) {
    console.error('Message read receipt error:', error);
    throw new Error(error.message || 'Could not mark messages as read.');
  }
}

export async function sendTextMessage({ chat, sender, body, replyTo = null, forwardedFrom = null }) {
  try {
    const text = body.trim();
    if (!text) throw new Error('Write a message before sending.');
    const payload = {
      senderId: sender.id,
      senderDisplayName: sender.displayName || sender.display_name || '',
      senderContactCode: sender.contactCode || sender.contact_code || '',
      body: text,
      read: false,
      createdAt: serverTimestamp(),
    };
    if (replyTo) payload.replyTo = replyTo;
    if (forwardedFrom) payload.forwardedFrom = forwardedFrom;
    if (chat.kind === 'group') {
      payload.groupId = chat.id;
      payload.participants = chat.memberIds || chat.members?.map((member) => member.id) || [sender.id];
    } else {
      payload.conversationId = directConversationId(sender.id, chat.id);
      payload.recipientId = chat.id;
      payload.participants = [sender.id, chat.id];
    }
    let reference;
    if (chat.kind === 'group') {
      reference = await addDoc(collection(db, 'messages'), payload);
      try {
        await updateDoc(doc(db, 'groups', chat.id), {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
        });
      } catch (summaryError) {
        console.warn('Group message saved, but its summary could not be updated:', summaryError);
      }
    } else {
      reference = await addDoc(collection(db, 'messages'), payload);
      const participants = [sender.id, chat.id].sort();
      const conversation = doc(db, 'conversations', directConversationId(sender.id, chat.id));
      try {
        await setDoc(conversation, {
          participants,
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (summaryError) {
        console.warn('Direct message saved, but its conversation summary could not be updated:', summaryError);
      }
    }
    return { id: reference.id, ...payload, created_at: new Date().toISOString(), sender_id: sender.id, group_id: payload.groupId || null };
  } catch (error) {
    console.error('Message send error:', error);
    throw new Error(error.message || 'Could not send this message. Please try again.');
  }
}

export async function editMessage(messageId, userId, body) {
  try {
    const text = body.trim();
    if (!text) throw new Error('Message cannot be empty.');
    const reference = doc(db, 'messages', messageId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists() || snapshot.data().senderId !== userId) {
        throw new Error('You can only edit your own messages.');
      }
      transaction.update(reference, { body: text, editedAt: serverTimestamp() });
    });
  } catch (error) {
    console.error('Message edit error:', error);
    throw new Error(error.message || 'Could not edit this message.');
  }
}

export async function toggleMessageReaction(messageId, userId, emoji) {
  try {
    const allowedEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    if (!allowedEmojis.includes(emoji)) throw new Error('That reaction is not supported.');
    const reference = doc(db, 'messages', messageId);
    let nextReactions = {};
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('Message not found.');
      nextReactions = { ...(snapshot.data().reactionsByUser || {}) };
      if (nextReactions[userId] === emoji) delete nextReactions[userId];
      else nextReactions[userId] = emoji;
      transaction.update(reference, { reactionsByUser: nextReactions });
    });
    return nextReactions;
  } catch (error) {
    console.error('Message reaction error:', error);
    throw new Error(error.message || 'Could not update this reaction.');
  }
}