import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { observeMessages, sendMessage } from '../../services/firestore/chat';
import type { MessageWithId } from '../../services/firestore/chat';
import { observeMembers } from '../../services/firestore/member';
import { setOpenChatAssignmentId } from '../../services/device/notification';
import type { MemberDoc, MessageType } from '../../types/firestore';

//依頼者と担当者がチャットをする画面

type Props = {
  familyId: string;
  uid: string;
  assignmentId: string;
  itemName: string;
  partnerUserId: string;
};

const MESSAGE_MAX_LENGTH = 500;
const PROPOSAL_MAX_LENGTH = 100;

type ProposalType = Exclude<MessageType, 'text'>;
type ProposalMode = 'none' | ProposalType;

//テキストに加えて提案の種類を表示する
const MESSAGE_TYPE_LABELS: Record<ProposalType, string> = {
  alternativeProposal: '代替品の提案',
  timeChangeProposal: '購入時間の変更',
};

//提案の入力欄
const PROPOSAL_INPUTS: Record<ProposalType, { button: string; placeholder: string }> = {
  alternativeProposal: { button: '代替品を提案', placeholder: '例: 低脂肪牛乳' },
  timeChangeProposal: { button: '時間を変更', placeholder: '例: 19時ごろ' },
};

//送信時刻表示する
function formatTime(message: MessageWithId): string | null {
  const date = message.sentTime?.toDate();
  if (date === undefined) {
    return null;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

type BubbleProps = {
  message: MessageWithId;
  mine: boolean;
  senderName: string | null;
};

//メッセージを表示する
function MessageBubble({ message, mine, senderName }: BubbleProps) {
  const time = formatTime(message);
  const typeLabel =
    message.messageType === 'text' ? null : MESSAGE_TYPE_LABELS[message.messageType];

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowPartner]}>
      {!mine && senderName !== null && <Text style={styles.senderName}>{senderName}</Text>}
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubblePartner,
          typeLabel !== null && styles.bubbleProposal,
        ]}
      >
        {typeLabel !== null && (
          <View style={message.bodyText !== '' && styles.proposal}>
            <Text style={[styles.proposalLabel, mine && styles.textMine]}>{typeLabel}</Text>
            {message.proposalValue !== null && (
              <Text style={[styles.proposalValue, mine && styles.textMine]}>
                {message.proposalValue}
              </Text>
            )}
          </View>
        )}
        {message.bodyText !== '' && (
          <Text style={[styles.body, mine && styles.textMine]}>{message.bodyText}</Text>
        )}
      </View>
      {time !== null && <Text style={styles.time}>{time}</Text>}
    </View>
  );
}

export default function ChatPage({ familyId, uid, assignmentId, itemName }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  //提案の種類と内容
  const [proposalMode, setProposalMode] = useState<ProposalMode>('none');
  const [proposalValue, setProposalValue] = useState('');

  const [members, setMembers] = useState<Record<string, MemberDoc>>({});

  //ヘッダーに品目名を出す
  useEffect(() => {
    navigation.setOptions({ title: itemName });
  }, [navigation, itemName]);

  //チャットの表示時には通知を出さない
  useFocusEffect(
    useCallback(() => {
      setOpenChatAssignmentId(assignmentId);
      return () => setOpenChatAssignmentId(null);
    }, [assignmentId]),
  );

  //メッセージの更新を行う
  useEffect(() => {
    setMessages([]);
    const unsubscribe = observeMessages(familyId, assignmentId, setMessages, observeError => {
      Alert.alert('メッセージを読み込めません', errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId, assignmentId]);

  //家族の表示名を取得する
  useEffect(() => {
    const unsubscribe = observeMembers(familyId, nextMembers => {
      const next: Record<string, MemberDoc> = {};
      for (const member of nextMembers) {
        next[member.id] = member;
      }
      setMembers(next);
    }, observeError => {
      Alert.alert('家族の情報を読み込めません', errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId]);

  //提案内容を入力する
  const canSend =
    !sending && (proposalMode === 'none' ? inputText.trim() !== '' : proposalValue.trim() !== '');

  function toggleProposalMode(mode: ProposalType) {
    setProposalMode(previous => (previous === mode ? 'none' : mode));
    setProposalValue('');
  }

  //入力の中断
  function clearProposal() {
    setProposalMode('none');
    setProposalValue('');
  }

  //提案を送信する
  async function handleSend() {
    if (!canSend) {
      return;
    }

    setSending(true);
    try {
      await sendMessage(
        familyId,
        assignmentId,
        proposalMode === 'none' ? 'text' : proposalMode,
        inputText,
        proposalMode === 'none' ? null : proposalValue,
      );
      setInputText('');
      clearProposal();
    } catch (sendError) {
      Alert.alert('送信に失敗しました', errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <FlatList
        data={messages}
        inverted
        keyExtractor={message => message.id}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>まだメッセージはありません</Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.senderUserId === uid}
            senderName={members[item.senderUserId]?.displayName ?? null}
          />
        )}
      />

      <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
        <View style={styles.proposalButtons}>
          {(Object.keys(PROPOSAL_INPUTS) as ProposalType[]).map(mode => (
            <Pressable
              key={mode}
              style={[styles.proposalButton, proposalMode === mode && styles.proposalButtonSelected]}
              onPress={() => toggleProposalMode(mode)}
              disabled={sending}
            >
              <Text
                style={[
                  styles.proposalButtonText,
                  proposalMode === mode && styles.proposalButtonTextSelected,
                ]}
              >
                {PROPOSAL_INPUTS[mode].button}
              </Text>
            </Pressable>
          ))}
        </View>

        {proposalMode !== 'none' && (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={proposalValue}
              onChangeText={setProposalValue}
              placeholder={PROPOSAL_INPUTS[proposalMode].placeholder}
              maxLength={PROPOSAL_MAX_LENGTH}
              editable={!sending}
            />
            <Pressable style={styles.closeButton} onPress={clearProposal} disabled={sending}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={proposalMode === 'none' ? 'メッセージを入力' : '補足があれば入力'}
            multiline
            maxLength={MESSAGE_MAX_LENGTH}
            editable={!sending}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
              pressed && styles.sendButtonPressed,
              !canSend && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>送信</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  list: {
    padding: 16,
    gap: 8,
  },
  //inverted のため上下が反転する。空表示を中央に出すために flex を使う
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
  },
  row: {
    maxWidth: '80%',
  },
  rowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowPartner: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bubbleMine: {
    backgroundColor: '#06c',
    borderBottomRightRadius: 4,
  },
  bubblePartner: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  bubbleProposal: {
    borderWidth: 2,
    borderColor: '#d97706',
  },
  proposal: {
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#9ca3af',
  },
  proposalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  proposalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
  },
  textMine: {
    color: '#fff',
  },
  time: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
    marginHorizontal: 4,
  },
  inputArea: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  proposalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  proposalButton: {
    borderWidth: 1,
    borderColor: '#d97706',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  proposalButtonSelected: {
    backgroundColor: '#d97706',
  },
  proposalButtonText: {
    fontSize: 13,
    color: '#d97706',
  },
  proposalButtonTextSelected: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    color: '#6b7280',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f4f6f8',
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#4682b4',
  },
  sendButtonPressed: {
    opacity: 0.7,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
});
