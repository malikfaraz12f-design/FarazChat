import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getUsersByIds } from './users';

function normalizeGroup(snapshot) {
  const group = snapshot.data();
  return {
    id: snapshot.id,
    ...group,
    avatar_url: group.avatarBase64 ? `data:image/jpeg;base64,${group.avatarBase64}` : '',
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
      bio: '',
      avatarBase64: '',
      memberIds: ids,
      createdBy: creator.id,
      createdAt: serverTimestamp(),
      lastMessage: '',
    });
    return { id: reference.id, name: name.trim(), bio: '', avatarBase64: '', avatar_url: '', memberIds: ids, createdBy: creator.id, member_count: ids.length, last_message: '', last_message_at: '' };
  } catch (error) {
    console.error('Group creation error:', error);
    throw new Error(error.message || 'Could not create the group.');
  }
}

async function loadGroup(groupId) {
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  if (!snapshot.exists()) throw new Error('This group no longer exists.');
  return normalizeGroup(snapshot);
}

export async function updateGroupDetails(groupId, updates) {
  try {
    const values = {};
    if (Object.hasOwn(updates, 'name')) {
      const name = updates.name.trim();
      if (!name) throw new Error('Group name cannot be empty.');
      values.name = name;
    }
    if (Object.hasOwn(updates, 'bio')) values.bio = updates.bio.trim();
    if (Object.hasOwn(updates, 'avatarBase64')) values.avatarBase64 = updates.avatarBase64;
    if (Object.keys(values).length === 0) throw new Error('There are no group changes to save.');
    await updateDoc(doc(db, 'groups', groupId), { ...values, updatedAt: serverTimestamp() });
    return await loadGroup(groupId);
  } catch (error) {
    console.error('Group profile update error:', error);
    throw new Error(error.message || 'Could not update the group profile.');
  }
}

export async function addGroupMember(groupId, memberId) {
  try {
    if (!memberId) throw new Error('Choose a member to add.');
    const group = await loadGroup(groupId);
    if (group.memberIds.includes(memberId)) throw new Error('This person is already in the group.');
    if (group.memberIds.length >= 50) throw new Error('Groups can have up to 50 members.');
    await updateDoc(doc(db, 'groups', groupId), { memberIds: arrayUnion(memberId) });
    return await loadGroup(groupId);
  } catch (error) {
    console.error('Group member add error:', error);
    throw new Error(error.message || 'Could not add this member.');
  }
}

export async function removeGroupMember(groupId, memberId) {
  try {
    if (!memberId) throw new Error('Choose a member to remove.');
    const group = await loadGroup(groupId);
    if (memberId === group.createdBy) throw new Error('The creator must leave the group instead.');
    if (!group.memberIds.includes(memberId)) throw new Error('This person is not in the group.');
    await updateDoc(doc(db, 'groups', groupId), { memberIds: arrayRemove(memberId) });
    return await loadGroup(groupId);
  } catch (error) {
    console.error('Group member removal error:', error);
    throw new Error(error.message || 'Could not remove this member.');
  }
}

export async function leaveGroup(groupId, userId) {
  try {
    const group = await loadGroup(groupId);
    if (!group.memberIds?.includes(userId)) throw new Error('You are not a member of this group.');
    if (group.memberIds.length === 1) {
      await deleteDoc(doc(db, 'groups', groupId));
      return { deleted: true };
    }
    const remainingMembers = group.memberIds.filter((memberId) => memberId !== userId);
    const changes = { memberIds: arrayRemove(userId) };
    if (group.createdBy === userId) changes.createdBy = remainingMembers[0];
    await updateDoc(doc(db, 'groups', groupId), changes);
    return { group: await loadGroup(groupId) };
  } catch (error) {
    console.error('Leave group error:', error);
    throw new Error(error.message || 'Could not leave this group.');
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