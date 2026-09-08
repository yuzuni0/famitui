import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Button, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions, } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { errorMessage } from '../lib/errors';
import { categoryLabel } from '../lib/format';
import { CATEGORY_UNLOCK_LEVEL, canRequestCategory, importantRequestLimit, todayJst } from '../lib/level';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { createItem, deleteItem, isAssigned, isAssignedTo, isRequested, itemStateLabel, updateItem } from '../services/item';
import type { CreateItemInput, ItemWithId } from '../services/item';
import { cancelRequestItem, requestItem } from '../services/itemActions';
import { observeMember } from '../services/member';
import type { MemberWithId } from '../services/member';
import { observeStores } from '../services/store';
import type { StoreWithId } from '../services/store';
import { CATEGORIES } from '../types/firestore';
import type { CategoryId } from '../types/firestore';
import { takePendingStore } from './StoreSearchPage';

//品目の追加と編集を行うモーダル

type Props = {
  familyId: string;
  uid: string;
  item: ItemWithId | null;
  onClose: () => void;
};

const ITEM_NAME_MAX_LENGTH = 50;
const NOTE_MAX_LENGTH = 200;
const ALTERNATIVE_MAX_COUNT = 5;
const ALTERNATIVE_NAME_MAX_LENGTH = 50;
const MAX_DISTANCE_METERS = 100000;
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 1000;
const HANDLE_HEIGHT = 28;

//重要な依頼の残り回数を返す
function remainingImportantRequests(member: MemberWithId): number {
  const limit = importantRequestLimit(member.level);
  if (member.importantRequestDate !== todayJst()) {
    return limit;
  }
  return Math.max(0, limit - (member.importantRequestCount ?? 0));
}

//複数のカテゴリをまとめて表示する
function storeCategoriesLabel(categories: CategoryId[]): string {
  if (categories.length === 0) {
    return '取り扱い不明';
  }
  return categories.map(categoryLabel).join('・');
}

//入力欄の初期値を item から作る
function initialFormState(item: ItemWithId | null) {
  return {
    itemName: item?.itemName ?? '',
    category: item?.category ?? ('dailyGoods' as CategoryId),
    //item の配列を複製する
    alternativeItemNames: item ? [...item.alternativeItemNames] : [],
    maxDistanceText: item?.maxDistanceMeters != null ? String(item.maxDistanceMeters) : '',
    note: item?.note ?? '',
    autoNotifyEnabled: item?.autoNotifyEnabled ?? false,
    preferredStoreId: item?.preferredStoreId ?? null,
  };
}

type ValidationResult =
  | { ok: true; input: CreateItemInput }
  | { ok: false; message: string };

export default function AddMissingModal({ familyId, uid, item, onClose }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const isFocused = useIsFocused();

  const [editing, setEditing] = useState<boolean>(item === null);

  const initial = initialFormState(item);
  const [itemName, setItemName] = useState<string>(initial.itemName);
  const [category, setCategory] = useState<CategoryId>(initial.category);
  const [alternativeItemNames, setAlternativeItemNames] = useState<string[]>(
    initial.alternativeItemNames,
  );

  //新しい代替品を入力する欄の値
  const [alternativeInput, setAlternativeInput] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [maxDistanceText, setMaxDistanceText] = useState<string>(initial.maxDistanceText);
  const [note, setNote] = useState<string>(initial.note);
  const [autoNotifyEnabled, setAutoNotifyEnabled] = useState<boolean>(initial.autoNotifyEnabled);
  //指定中の店舗
  const [preferredStoreId, setPreferredStoreId] = useState<string | null>(
    initial.preferredStoreId,
  );
  const [pendingStoreName, setPendingStoreName] = useState<string | null>(null);
  const [pendingStoreCategories, setPendingStoreCategories] = useState<CategoryId[] | null>(
    null,
  );
  //登録済みの店舗の一覧
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  //担当者の情報
  const [member, setMember] = useState<MemberWithId | null>(null);
  const [isImportant, setIsImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [scrollLocked, setScrollLocked] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const scrollOffsetRef = useRef(0);
  //指の移動量
  const dragStartRef = useRef(0);
  const sheetOffsetRef = useRef(0);
  const fromHandleRef = useRef(false);
  const closingRef = useRef(false);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }

  //モーダルを閉じるアニメーション
  function dismissSheet() {
    closingRef.current = true;
    setDismissing(true);
    Animated.timing(translateY, {
      toValue: windowHeight,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  }

  //モーダルを元の位置へ戻す
  function resetSheet() {
    sheetOffsetRef.current = 0;
    setScrollLocked(false);
    Animated.spring(translateY, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
  }

  const scrollGesture = Gesture.Native();

  const panGesture = Gesture.Pan()
    .enabled(!submitting)
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(scrollGesture)
    .onBegin(event => {
      fromHandleRef.current = event.y < HANDLE_HEIGHT;
      dragStartRef.current = 0;
      sheetOffsetRef.current = 0;
    })
    .onUpdate(event => {
      if (closingRef.current) {
        return;
      }

      //モーダルがまだスクロールできるかの確認
      const scrolling =
        !fromHandleRef.current && sheetOffsetRef.current <= 0 && scrollOffsetRef.current > 0;
      if (scrolling) {
        dragStartRef.current = event.translationY;
        return;
      }

      const offset = Math.max(0, event.translationY - dragStartRef.current);
      if (offset > 0 && sheetOffsetRef.current <= 0) {
        setScrollLocked(true);
      }
      sheetOffsetRef.current = offset;
      translateY.setValue(offset);
    })
    .onEnd((event, success) => {
      if (closingRef.current) {
        return;
      }

      const offset = sheetOffsetRef.current;
      const shouldClose =
        success && (offset > CLOSE_DISTANCE || (offset > 0 && event.velocityY > CLOSE_VELOCITY));
      if (shouldClose) {
        dismissSheet();
      } else {
        resetSheet();
      }
    });

  //店舗の一覧を監視する
  useEffect(() => {
    setStores(null);
    const unsubscribe = observeStores(familyId, setStores);
    return unsubscribe;
  }, [familyId]);

  //自分のメンバー情報を監視する
  useEffect(() => {
    setMember(null);
    const unsubscribe = observeMember(familyId, uid, setMember);
    return unsubscribe;
  }, [familyId, uid]);

  //StoreSearch から戻ってきた時に、選んだ店舗を受け取る
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingStore();
      if (pending === null) {
        return;
      }
      setPreferredStoreId(pending.sourceId);
      setPendingStoreName(pending.name);
      setPendingStoreCategories(pending.categories);
    }, []),
  );

  //指定中の店舗
  const preferredStore = useMemo<StoreWithId | undefined>(
    () => stores?.find(entry => entry.id === preferredStoreId),
    [preferredStoreId, stores],
  );

  //表示用の店舗名
  const preferredStoreName = useMemo<string | null>(() => {
    if (preferredStoreId === null) {
      return null;
    }
    if (preferredStore !== undefined) {
      return preferredStore.storeName;
    }
    if (pendingStoreName !== null) {
      return pendingStoreName;
    }
    if (stores === null) {
      return '読み込み中…';
    }
    return '指定した店舗が見つかりません';
  }, [preferredStoreId, preferredStore, pendingStoreName, stores]);

  //表示用の店舗のカテゴリ
  const preferredStoreCategories = useMemo<CategoryId[] | null>(() => {
    if (preferredStoreId === null) {
      return null;
    }
    if (preferredStore !== undefined) {
      return preferredStore.categories;
    }
    return pendingStoreCategories;
  }, [preferredStoreId, preferredStore, pendingStoreCategories]);

  //完了済みの品目は編集できない
  //担当が決まっている間は、担当している本人だけが編集できる
  const editable =
    item === null ||
    (item.status !== 'completed' && (!isAssigned(item) || isAssignedTo(item, uid)));

  //依頼も担当も付いていない不足品だけを削除できる
  const deletable =
    item !== null && item.status !== 'completed' && !isRequested(item) && !isAssigned(item);

  const switchable = item !== null && item.status !== 'completed' && !isAssigned(item);

  //担当がまだ決まっていない品目だけを受け付けられる
  const acceptable = item !== null && item.status !== 'completed' && !isAssigned(item);

  //依頼者は担当者とチャットができる
  const chattable =
    item !== null && item.status !== 'completed' && isAssigned(item) && item.requesterUserId === uid;

  //重要な依頼の条件を確認する
  const importantLimit = member === null ? 0 : importantRequestLimit(member.level);
  const importantRemaining = member === null ? 0 : remainingImportantRequests(member);
  const importantAvailable = importantLimit >= 1 && importantRemaining > 0;
  const importantSelected = isImportant && importantAvailable;
  let importantNote: string;
  if (member === null) {
    importantNote = '読み込み中…';
  } else if (importantLimit < 1) {
    importantNote = 'レベル3から使えます';
  } else if (importantRemaining < 1) {
    importantNote = '本日の上限に達しました';
  } else {
    importantNote = `本日の残り${importantRemaining}回`;
  }

  //依頼可能なカテゴリかを判定する
  const categoryRequestable =
    member !== null && item !== null && canRequestCategory(member.level, item.category);
  const categoryNote =
    member !== null && item !== null && !categoryRequestable
      ? `このカテゴリはレベル${CATEGORY_UNLOCK_LEVEL[item.category]}から依頼できます`
      : null;

  //入力欄を item の値へ戻す
  function resetForm() {
    const initial = initialFormState(item);
    setItemName(initial.itemName);
    setCategory(initial.category);
    setAlternativeItemNames(initial.alternativeItemNames);
    setMaxDistanceText(initial.maxDistanceText);
    setNote(initial.note);
    setAutoNotifyEnabled(initial.autoNotifyEnabled);
    setPreferredStoreId(initial.preferredStoreId);
    setPendingStoreName(null);
    setPendingStoreCategories(null);
    setAlternativeInput('');
    setEditingIndex(null);
    setError(null);
  }

  //編集を取り消して表示状態へ戻す
  function handleCancelEditing() {
    resetForm();
    setEditing(false);
  }

  //代替品を追加する
  function handleSubmitAlternative() {
    const trimmed = alternativeInput.trim();
    if (trimmed === '') {
      return;
    }

    if (editingIndex === null && alternativeItemNames.length >= ALTERNATIVE_MAX_COUNT) {
      setError(`代替品は${ALTERNATIVE_MAX_COUNT}件以下で入力してください。`);
      return;
    }
    if (trimmed.length > ALTERNATIVE_NAME_MAX_LENGTH) {
      setError(`代替品は1件につき${ALTERNATIVE_NAME_MAX_LENGTH}文字以下で入力してください。`);
      return;
    }

    if (editingIndex === null) {
      setAlternativeItemNames(previous => [...previous, trimmed]);
    } else {
      setAlternativeItemNames(previous =>
        previous.map((name, index) => (index === editingIndex ? trimmed : name)),
      );
      setEditingIndex(null);
    }

    setAlternativeInput('');
    setError(null);
  }

  //追加済みの代替品を編集する
  function handleEditAlternative(index: number) {
    setEditingIndex(index);
    setAlternativeInput(alternativeItemNames[index]);
    setError(null);
  }

  //代替品の編集を取り消す
  function handleCancelAlternative() {
    setEditingIndex(null);
    setAlternativeInput('');
  }

  //代替品を削除する
  function handleRemoveAlternative(index: number) {
    setAlternativeItemNames(previous => previous.filter((_, current) => current !== index));

    if (editingIndex === index) {
      //編集中の要素を消したとき編集を終える
      setEditingIndex(null);
      setAlternativeInput('');
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  }

  function validate(): ValidationResult {
    const trimmedName = itemName.trim();
    if (trimmedName.length < 1 || trimmedName.length > ITEM_NAME_MAX_LENGTH) {
      return { ok: false, message: `商品名は1文字以上${ITEM_NAME_MAX_LENGTH}文字以下で入力してください。` };
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > NOTE_MAX_LENGTH) {
      return { ok: false, message: `備考は${NOTE_MAX_LENGTH}文字以下で入力してください。` };
    }

    if (alternativeItemNames.length > ALTERNATIVE_MAX_COUNT) {
      return { ok: false, message: `代替品は${ALTERNATIVE_MAX_COUNT}件以下で入力してください。` };
    }
    if (alternativeItemNames.some(name => name.length > ALTERNATIVE_NAME_MAX_LENGTH)) {
      return {
        ok: false,
        message: `代替品は1件につき${ALTERNATIVE_NAME_MAX_LENGTH}文字以下で入力してください。`,
      };
    }

    //空欄は距離を指定しないものとする
    const trimmedDistance = maxDistanceText.trim();
    let maxDistanceMeters: number | null = null;
    if (trimmedDistance !== '') {
      const parsed = Number(trimmedDistance);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_DISTANCE_METERS) {
        return {
          ok: false,
          message: `距離は1以上${MAX_DISTANCE_METERS}以下の数値で入力してください。`,
        };
      }
      maxDistanceMeters = parsed;
    }

    return {
      ok: true,
      input: {
        itemName: trimmedName,
        category,
        alternativeItemNames,
        maxDistanceMeters,
        note: trimmedNote,
        autoNotifyEnabled,
        preferredStoreId,
      },
    };
  }

  //店舗を選ぶ画面へ移る
  function handleSelectStore() {
    if (submitting) {
      return;
    }
    navigation.navigate('StoreSearch');
  }

  //店舗の指定を解除する
  function handleClearStore() {
    setPreferredStoreId(null);
    setPendingStoreName(null);
    setPendingStoreCategories(null);
  }

  //保存する
  async function handleSave() {
    if (submitting) {
      return;
    }

    const result = validate();
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (item === null) {
        await createItem(familyId, uid, result.input);
      } else {
        await updateItem(familyId, item.id, result.input);
      }
      onClose();
    } catch (saveError) {
      //失敗した場合はモーダルを閉じない
      setError(errorMessage(saveError));
      setSubmitting(false);
    }
  }

  //削除する
  async function handleDelete() {
    if (item === null || submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await deleteItem(familyId, item.id);
      onClose();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      setSubmitting(false);
    }
  }

  //不足と依頼の状態を切り替える
  async function handleSwitchStatus() {
    if (item === null || submitting) {
      return;
    }

    const toRequested = !isRequested(item);

    setError(null);
    setSubmitting(true);
    try {
      if (toRequested) {
        await requestItem(familyId, item.id, importantSelected);
        setIsImportant(false);
      } else {
        await cancelRequestItem(familyId, item.id);
      }
    } catch (switchError) {
      setError(errorMessage(switchError, toRequested ? 'requestItem' : 'cancelRequestItem'));
    } finally {
      setSubmitting(false);
    }
  }

  //担当者とのチャット画面へ移る
  function handleOpenChat() {
    if (item === null || item.activeAssignmentId === null || submitting) {
      return;
    }

    const assignmentId = item.activeAssignmentId;
    navigation.navigate('Chat', {
      familyId,
      assignmentId,
      itemName: item.itemName,
      //assignmentId は {itemId}_{uid} の形
      partnerUserId: assignmentId.slice(assignmentId.indexOf('_') + 1),
    });
  }

  //他の品目も併せて選ぶ画面へ移る
  function handleAccept() {
    if (item === null || submitting) {
      return;
    }

    onClose();
    navigation.navigate('AcceptRequest', { initialItemId: item.id });
  }

  //削除の前に確認をする
  function confirmDelete() {
    Alert.alert('確認', `「${item?.itemName}」を削除しますか。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: handleDelete },
    ]);
  }

  //見出しは状態ごとに変える
  let title: string;
  if (item === null) {
    title = '不足品を追加する';
  } else if (editing) {
    title = '不足品を編集する';
  } else {
    title = item.itemName;
  }

  return (
    <Modal visible={isFocused} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={[styles.backdrop, dismissing && styles.backdropClear]}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>

            <GestureDetector gesture={scrollGesture}>
              <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                scrollEnabled={!scrollLocked}
                bounces={false}
                overScrollMode="never"
              >
                <Text style={styles.title}>{title}</Text>

                {!editing && item !== null ? (
                  <>
                    {!editable && (
                      <Text style={styles.note}>
                        {item.status === 'completed'
                          ? 'この品目は完了しているため、編集できません。'
                          : '他の人が担当しているため、編集できません。'}
                      </Text>
                    )}

                    {item.isImportant && (
                      <View style={styles.importantBadge}>
                        <Text style={styles.importantBadgeText}>重要</Text>
                      </View>
                    )}

                    <Text style={styles.label}>商品名</Text>
                    <Text style={styles.value}>{item.itemName}</Text>

                    <Text style={styles.label}>カテゴリ</Text>
                    <Text style={styles.value}>{categoryLabel(item.category)}</Text>

                    <Text style={styles.label}>状態</Text>
                    <Text style={styles.value}>{itemStateLabel(item)}</Text>

                    <Text style={styles.label}>代替品</Text>
                    {item.alternativeItemNames.length === 0 ? (
                      <Text style={styles.value}>なし</Text>
                    ) : (
                      item.alternativeItemNames.map((name, index) => (
                        <Text key={`${index}-${name}`} style={styles.value}>
                          ・{name}
                        </Text>
                      ))
                    )}

                    <Text style={styles.label}>距離の上限（メートル）</Text>
                    <Text style={styles.value}>
                      {item.maxDistanceMeters != null ? String(item.maxDistanceMeters) : '指定なし'}
                    </Text>

                    <Text style={styles.label}>購入する店舗</Text>
                    <Text style={styles.value}>{preferredStoreName ?? '指定なし'}</Text>
                    {preferredStoreCategories !== null && (
                      <Text style={styles.note}>{storeCategoriesLabel(preferredStoreCategories)}</Text>
                    )}

                    {item.note !== '' && (
                      <>
                        <Text style={styles.label}>備考</Text>
                        <Text style={styles.value}>{item.note}</Text>
                      </>
                    )}

                    <Text style={styles.label}>自動で通知する</Text>
                    <Text style={styles.value}>{item.autoNotifyEnabled ? 'する' : 'しない'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>商品名</Text>
                    <TextInput
                      style={styles.input}
                      value={itemName}
                      onChangeText={setItemName}
                      placeholder="商品名"
                      editable={!submitting}
                      maxLength={ITEM_NAME_MAX_LENGTH}
                    />

                    <Text style={styles.label}>カテゴリ</Text>
                    <View style={styles.categories}>
                      {CATEGORIES.map(entry => (
                        <Pressable
                          key={entry.id}
                          style={[styles.category, category === entry.id && styles.categorySelected]}
                          onPress={() => setCategory(entry.id)}
                          disabled={submitting}
                        >
                          <Text style={category === entry.id ? styles.categoryLabelSelected : undefined}>
                            {entry.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>代替品</Text>
                    {alternativeItemNames.map((name, index) => (
                      <View key={`${index}-${name}`} style={styles.alternativeRow}>
                        <Pressable
                          style={[
                            styles.alternativeName,
                            editingIndex === index && styles.alternativeNameEditing,
                          ]}
                          onPress={() => handleEditAlternative(index)}
                          disabled={submitting}
                        >
                          <Text>{name}</Text>
                        </Pressable>
                        <Button
                          title="削除"
                          color="#c00"
                          onPress={() => handleRemoveAlternative(index)}
                          disabled={submitting}
                        />
                      </View>
                    ))}

                    <TextInput
                      style={styles.input}
                      value={alternativeInput}
                      onChangeText={setAlternativeInput}
                      placeholder={editingIndex === null ? '代替品を入力する' : '代替品を書き換える'}
                      editable={!submitting}
                      maxLength={ALTERNATIVE_NAME_MAX_LENGTH}
                    />
                    <View style={styles.alternativeButtons}>
                      <Button
                        title={editingIndex === null ? '追加する' : '更新する'}
                        onPress={handleSubmitAlternative}
                        disabled={submitting}
                      />
                      {editingIndex !== null && (
                        <Button
                          title="編集をやめる"
                          onPress={handleCancelAlternative}
                          disabled={submitting}
                        />
                      )}
                    </View>
                    <Text style={styles.note}>
                      {ALTERNATIVE_MAX_COUNT}件まで登録できます。タップすると編集できます。
                    </Text>

                    <Text style={styles.label}>距離の上限（メートル）</Text>
                    <TextInput
                      style={styles.input}
                      value={maxDistanceText}
                      onChangeText={setMaxDistanceText}
                      placeholder="指定しない場合は空欄"
                      keyboardType="number-pad"
                      editable={!submitting}
                    />

                    <Text style={styles.label}>備考</Text>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={note}
                      onChangeText={setNote}
                      placeholder="備考"
                      multiline
                      editable={!submitting}
                      maxLength={NOTE_MAX_LENGTH}
                    />

                    <View style={styles.switchRow}>
                      <Text style={styles.label}>自動で通知する</Text>
                      <Switch
                        value={autoNotifyEnabled}
                        onValueChange={setAutoNotifyEnabled}
                        disabled={submitting}
                      />
                    </View>

                    <Text style={styles.label}>購入する店舗</Text>
                    <Text style={styles.value}>{preferredStoreName ?? '指定なし'}</Text>
                    {preferredStoreCategories !== null && (
                      <Text style={styles.note}>{storeCategoriesLabel(preferredStoreCategories)}</Text>
                    )}
                    <View style={styles.alternativeButtons}>
                      <Button title="店舗を指定する" onPress={handleSelectStore} disabled={submitting} />
                      {preferredStoreId !== null && (
                        <Button title="指定を解除する" onPress={handleClearStore} disabled={submitting} />
                      )}
                    </View>
                  </>
                )}

                {error !== null && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {editing ? (
                  <>
                    <Button
                      title={item === null ? '追加する' : '保存する'}
                      onPress={handleSave}
                      disabled={submitting}
                    />
                    {item !== null && (
                      <Button
                        title="キャンセルする"
                        onPress={handleCancelEditing}
                        disabled={submitting}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {acceptable && (
                      <Button
                        title="依頼を受け付ける"
                        onPress={handleAccept}
                        disabled={submitting}
                      />
                    )}
                    {chattable && (
                      <Button title="チャット" onPress={handleOpenChat} disabled={submitting} />
                    )}
                    {switchable && !isRequested(item) && categoryRequestable && (
                      <>
                        <View style={styles.switchRow}>
                          <Text style={styles.label}>重要な依頼にする</Text>
                          <Switch
                            value={importantSelected}
                            onValueChange={setIsImportant}
                            disabled={submitting || !importantAvailable}
                          />
                        </View>
                        <Text style={styles.note}>{importantNote}</Text>
                      </>
                    )}
                    {switchable && !isRequested(item) && categoryNote !== null && (
                      <Text style={styles.note}>{categoryNote}</Text>
                    )}
                    {switchable && (isRequested(item) || categoryRequestable) && (
                      <Button
                        title={isRequested(item) ? '依頼を取り下げる' : '依頼する'}
                        onPress={handleSwitchStatus}
                        disabled={submitting}
                      />
                    )}
                    {editable && (
                      <Button title="編集する" onPress={() => setEditing(true)} disabled={submitting} />
                    )}
                    {deletable && (
                      <Button
                        title="削除する"
                        color="#c00"
                        onPress={confirmDelete}
                        disabled={submitting}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            </GestureDetector>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#0006',
  },
  backdropClear: {
    backgroundColor: 'transparent',
  },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
  },
  handleArea: {
    height: HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  label: {
    color: '#666',
  },
  value: {
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  category: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categorySelected: {
    borderColor: '#06c',
    backgroundColor: '#06c',
  },
  categoryLabelSelected: {
    color: '#fff',
  },
  alternativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alternativeName: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  alternativeNameEditing: {
    borderColor: '#06c',
  },
  alternativeButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  note: {
    color: '#666',
  },
  importantBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#c00',
  },
  importantBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#c00',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
});