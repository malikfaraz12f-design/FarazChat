import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getUsersByIds } from './users';

function normalizeGroup(snapshot) {
  const group = snapshot.data();
  return {
    id: snapshot.id,
    ...group,
    member_count: group.memberIds?.length || 0,
    last_message: group.lastMessage || '',
    last_message_at: group.lastMessageAt?.toDate?.().toISOString() || '',
  };
}

export async function createGroup({ name, memberIds, creator }) {
  try {
    const ids = [...new Set([creator.id, ...memberIds])];
    if (!name.trim() || ids.length < 2) throw new Error('Choose a group name and at least one member.');
    const reference = await addDoc(collection(db, 'groups'), {
      name: name.trim(),
      memberIds: ids,
      createdBy: creator.id,
      createdAt: serverTimestamp(),
      lastMessage: '',
    });
    return { id: reference.id, name: name.trim(), memberIds: ids, member_count: ids.length, last_message: '', last_message_at: '' };
  } catch (error) {
    console.error('Group creation error:', error);
    throw new Error(error.message || 'Could not create the group.');
  }
}

export function subscribeToGroups(userId, onGroups, onError) {
  try {
    const groupsQuery = query(collection(db, 'groups'), where('memberIds', 'array-contains', userId));
    return onSnapshot(groupsQuery, (snapshot) => {
      const groups = snapshot.docs.map(normalizeGroup)
        .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0));
      onGroups(groups);
    }, (error) => {
      console.error('Group subscription error:', error);
      onError?.(new Error(error.message || 'Could not subscribe to groups.'));
    });
  } catch (error) {
    console.error('Group subscription setup error:', error);
    onError?.(new Error(error.message || 'Could not load groups.'));
    return () => {};
  }
}

export async function getGroupMembers(group) {
  try {
    return await getUsersByIds(group.memberIds || []);
  } catch (error) {
    console.error('Group member load error:', error);
    throw new Error(error.message || 'Could not load group members.');
  }
}

export async function getGroupsForUser(userId) {
  try {
    const snapshot = await getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', userId)));
    return snapshot.docs.map(normalizeGroup);
  } catch (error) {
    console.error('Group load error:', error);
    throw new Error(error.message || 'Could not load groups.');
  }
}