import {
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

function toStatus(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    body: data.body || '',
    created_at: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
    viewed: false,
    likes_count: data.likes?.length || 0,
    views_count: data.viewedBy?.length || 0,
    media_url: data.mediaBase64 ? `data:${data.mediaType || 'image/jpeg'};base64,${data.mediaBase64}` : '',
    media_type: data.mediaType || '',
  };
}

function groupStatuses(docs, ownerId) {
  const groups = new Map();
  docs.forEach((snapshot) => {
    const rawStatus = snapshot.data();
    const status = { ...toStatus(snapshot), viewed: (rawStatus.viewedBy || []).includes(ownerId) };
    const authorId = status.ownerId;
    if (!groups.has(authorId)) {
      groups.set(authorId, {
        own: authorId === ownerId,
        user: {
          id: authorId,
          uid: authorId,
          display_name: status.authorDisplayName || status.authorContactCode || 'User',
          username: status.authorContactCode || authorId,
          contact_code: status.authorContactCode || '',
          avatar_url: status.authorAvatarBase64 ? `data:image/jpeg;base64,${status.authorAvatarBase64}` : '',
        },
        statuses: [],
      });
    }
    groups.get(authorId).statuses.push(status);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    statuses: group.statuses.sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
  }));
}

export async function publishStatus(user, body, media = null) {
  try {
    const text = body.trim();
    if (!text && !media) throw new Error('Write something or choose media before sharing your status.');
    if (media?.mediaBase64?.length > 750_000) throw new Error('Choose a smaller image or video (under 550 KB).');
    await addDoc(collection(db, 'statuses'), {
      ownerId: user.id,
      authorDisplayName: user.displayName || user.display_name || '',
      authorContactCode: user.contactCode || user.contact_code || '',
      authorAvatarBase64: user.avatarBase64 || '',
      body: text,
      mediaBase64: media?.mediaBase64 || '',
      mediaType: media?.mediaType || '',
      mediaName: media?.mediaName || '',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + STATUS_LIFETIME_MS),
      likes: [],
      viewedBy: [],
      comments: [],
    });
  } catch (error) {
    console.error('Status publish error:', error);
    throw new Error(error.message || 'Could not share this status.');
  }
}

export function subscribeToStatuses(ownerId, onStatuses, onError) {
  try {
    const statusesQuery = query(collection(db, 'statuses'), where('expiresAt', '>', Timestamp.now()));
    return onSnapshot(statusesQuery, (snapshot) => {
      onStatuses(groupStatuses(snapshot.docs, ownerId));
      deleteExpiredOwnStatuses(ownerId).catch((error) => console.error('Expired status cleanup error:', error));
    }, (error) => {
      console.error('Status subscription error:', error);
      onError?.(new Error(error.message || 'Could not subscribe to statuses.'));
    });
  } catch (error) {
    console.error('Status subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load statuses.'));
    return () => {};
  }
}

export async function getStatuses(ownerId) {
  try {
    const snapshot = await getDocs(query(collection(db, 'statuses'), where('expiresAt', '>', Timestamp.now())));
    return groupStatuses(snapshot.docs, ownerId);
  } catch (error) {
    console.error('Status load error:', error);
    throw new Error(error.message || 'Could not load statuses.');
  }
}

export async function deleteExpiredOwnStatuses(ownerId) {
  try {
    const snapshot = await getDocs(query(collection(db, 'statuses'), where('ownerId', '==', ownerId)));
    const expired = snapshot.docs.filter((item) => item.data().expiresAt?.toMillis?.() <= Date.now());
    await Promise.all(expired.map((item) => deleteDoc(item.ref)));
  } catch (error) {
    console.error('Expired status cleanup error:', error);
    throw new Error(error.message || 'Could not clean expired statuses.');
  }
}

export async function deleteStatus(statusId) {
  try {
    await deleteDoc(doc(db, 'statuses', statusId));
  } catch (error) {
    console.error('Status deletion error:', error);
    throw new Error(error.message || 'Could not delete this status.');
  }
}

export async function getStatusInteractions(statusId, viewerId) {
  try {
    const snapshot = await getDoc(doc(db, 'statuses', statusId));
    if (!snapshot.exists()) throw new Error('That status has expired.');
    const status = snapshot.data();
    return {
      liked: (status.likes || []).includes(viewerId),
      likes_count: status.likes?.length || 0,
      views_count: status.viewedBy?.length || 0,
      comments: status.comments || [],
      viewers: [],
    };
  } catch (error) {
    console.error('Status interaction load error:', error);
    throw new Error(error.message || 'Could not load status activity.');
  }
}

export async function markStatusViewed(statusId, userId) {
  try {
    await updateDoc(doc(db, 'statuses', statusId), { viewedBy: arrayUnion(userId) });
  } catch (error) {
    console.error('Status view error:', error);
    throw new Error(error.message || 'Could not mark this status as viewed.');
  }
}

export async function toggleStatusLike(statusId, userId, liked) {
  try {
    await updateDoc(doc(db, 'statuses', statusId), { likes: liked ? arrayRemove(userId) : arrayUnion(userId) });
    return await getStatusInteractions(statusId, userId);
  } catch (error) {
    console.error('Status like error:', error);
    throw new Error(error.message || 'Could not update your reaction.');
  }
}

export async function addStatusComment(statusId, user, body) {
  try {
    const text = body.trim();
    if (!text) throw new Error('Write a reply first.');
    const comment = {
      id: `${user.id}_${Date.now()}`,
      body: text,
      createdAt: new Date().toISOString(),
      user: {
        id: user.id,
        display_name: user.displayName || user.display_name || '',
        username: user.contactCode || user.contact_code || '',
        avatar_url: user.avatarBase64 ? `data:image/jpeg;base64,${user.avatarBase64}` : user.avatar_url || '',
      },
    };
    await updateDoc(doc(db, 'statuses', statusId), { comments: arrayUnion(comment) });
    return comment;
  } catch (error) {
    console.error('Status comment error:', error);
    throw new Error(error.message || 'Could not add your reply.');
  }
}

export async function removeStatusComment(statusId, comment) {
  try {
    await updateDoc(doc(db, 'statuses', statusId), { comments: arrayRemove(comment) });
  } catch (error) {
    console.error('Status comment removal error:', error);
    throw new Error(error.message || 'Could not delete this reply.');
  }
}