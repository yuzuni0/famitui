import { addDoc, collection, getFirestore, orderBy, query, serverTimestamp } from '@react-native-firebase/firestore';
import type { Timestamp } from '@react-native-firebase/firestore';
import type { MessageDoc, MessageType } from '../types/firestore';
import { getCurrentUid } from './auth';
import { observeCollection } from './observe';
import type { WithId } from './observe';
//メッセージの送受信を行う

const FAMILIES_COLLECTION = 'families';
const ASSIGNMENTS_COLLECTION = 'assignments';
const MESSAGES_COLLECTION = 'messages';

//メッセージにIDを付与する
export type MessageWithId = WithId<Omit<MessageDoc, 'sentTime'> & { sentTime: Timestamp | null }>;

//メッセージへの参照を行う
function messagesRef(familyId: string, assignmentId: string) {
  return collection(
    getFirestore(),
    FAMILIES_COLLECTION,
    familyId,
    ASSIGNMENTS_COLLECTION,
    assignmentId,
    MESSAGES_COLLECTION,
  );
}

//メッセージの変更を確認する
export function observeMessages(
  familyId: string,
  assignmentId: string,
  onChange: (messages: MessageWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeCollection<MessageWithId>(
    query(messagesRef(familyId, assignmentId), orderBy('sentTime', 'desc')),
    `observeMessages failed: ${familyId}/${assignmentId}`,
    onChange,
    onError,
  );
}

//メッセージを送信する処理
export async function sendMessage(
  familyId: string,
  assignmentId: string,
  messageType: MessageType,
  bodyText: string,
  proposalValue: string | null = null,
): Promise<boolean> {
  const trimmed = bodyText.trim();
  const trimmedProposal = proposalValue === null ? null : proposalValue.trim();

  //メッセージの状態を確認する
  if (messageType === 'text' ? trimmed === '' : (trimmedProposal ?? '') === '') {
    return false;
  }

  const uid = getCurrentUid();
  if (uid === null) {
    throw new Error('ログインの状態が失われました。');
  }

  await addDoc(messagesRef(familyId, assignmentId), {
    senderUserId: uid,
    bodyText: trimmed,
    messageType,
    proposalValue: trimmedProposal,
    sentTime: serverTimestamp(),
  });
  return true;
}