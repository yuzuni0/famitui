import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../lib/errors';
import { categoryLabel } from '../lib/format';
import { CATEGORY_UNLOCK_LEVEL, canRequestCategory, importantRequestLimit, remainingImportantRequests } from '../lib/level';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { takePendingStore } from '../pages/store/StoreSearchPage';
import { createItem, deleteItem, isAssigned, isAssignedTo, isRequested, itemStateLabel, updateItem } from '../services/firestore/item';
import type { CreateItemInput, ItemWithId } from '../services/firestore/item';
import { observeMember } from '../services/firestore/member';
import type { MemberWithId } from '../services/firestore/member';
import { observeStores } from '../services/firestore/store';
import type { StoreWithId } from '../services/firestore/store';
import { cancelRequestItem, requestItem } from '../services/functions/itemActions';
import { CATEGORIES } from '../types/firestore';
import type { CategoryId } from '../types/firestore';

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

//複数のカテゴリをまとめて表示する
function storeCategoriesLabel(categories: CategoryId[]): string {
  if (categories.length === 0) {
    return '取り扱い不明';
  }
  return categories.map(categoryLabel).join('・');
}

type ActionButtonProps = {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
  half?: boolean;
  disabled: boolean;
  onPress: () => void;
};

//操作ボタン
function ActionButton({ title, variant = 'secondary', compact = false, half = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        half && styles.actionButtonHalf,
        variant === 'primary' && styles.actionButtonPrimary,
        variant === 'danger' && styles.actionButtonDanger,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.actionTitle,
          variant === 'primary' && styles.actionTitlePrimary,
          variant === 'danger' && styles.actionTitleDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
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
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //背景はその場でフェード、シートは下から出し入れする
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const scrollOffsetRef = useRef(0);
  //指の移動量
  const dragStartRef = useRef(0);
  const sheetOffsetRef = useRef(0);
  const fromHandleRef = useRef(false);
  const closingRef = useRef(false);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }

  //開く時のアニメーション
  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, translateY]);

  //閉じる時のアニメーション
  function dismissSheet() {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: windowHeight, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
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
    const unsubscribe = observeStores(familyId, setStores, observeError => {
      setError(errorMessage(observeError));
    });
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
      dismissSheet();
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
      dismissSheet();
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
    <Modal visible={isFocused} animationType="none" transparent onRequestClose={dismissSheet}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
        {/* シートの外側をタップで閉じる */}
        <Pressable style={styles.backdropTouch} onPress={dismissSheet} disabled={submitting} />
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>

            <GestureDetector gesture={scrollGesture}>
              <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                scrollEnabled={!scrollLocked}
                bounces={false}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
              >
                {(editing || item === null) && <Text style={styles.title}>{title}</Text>}

                {!editing && item !== null ? (
                  <>
                    {!editable && (
                      <View style={styles.warningBanner}>
                        <Text style={styles.warningText}>
                          {item.status === 'completed'
                            ? 'この品目は完了しています。'
                            : '他の人が担当しているため、編集できません。'}
                        </Text>
                      </View>
                    )}

                    <View style={styles.card}>
                      <View style={styles.header}>
                        <Text style={styles.itemName}>{item.itemName}</Text>
                        <View style={styles.chips}>
                          <View style={styles.categoryChip}>
                            <Text style={styles.categoryChipText}>{categoryLabel(item.category)}</Text>
                          </View>
                          {item.isImportant && (
                            <View style={styles.importantBadge}>
                              <Text style={styles.importantBadgeText}>重要</Text>
                            </View>
                          )}
                          <Text style={styles.state}>{itemStateLabel(item)}</Text>
                        </View>
                      </View>

                      <DetailRow label="購入する店舗">
                        <Text style={styles.value}>{preferredStoreName ?? '指定なし'}</Text>
                        {preferredStoreCategories !== null && (
                          <Text style={styles.note}>{storeCategoriesLabel(preferredStoreCategories)}</Text>
                        )}
                      </DetailRow>

                      <DetailRow label="距離の上限">
                        <Text style={styles.value}>
                          {item.maxDistanceMeters != null ? `${item.maxDistanceMeters}m` : '指定なし'}
                        </Text>
                      </DetailRow>

                      <DetailRow label="代替品">
                        {item.alternativeItemNames.length === 0 ? (
                          <Text style={styles.value}>なし</Text>
                        ) : (
                          item.alternativeItemNames.map((name, index) => (
                            <Text key={`${index}-${name}`} style={styles.value}>
                              ・{name}
                            </Text>
                          ))
                        )}
                      </DetailRow>

                      {item.note !== '' && (
                        <DetailRow label="備考">
                          <Text style={styles.value}>{item.note}</Text>
                        </DetailRow>
                      )}
                    </View>
                  </>
                ) : (
                  <View style={styles.form}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>商品名</Text>
                      <TextInput
                        style={styles.input}
                        value={itemName}
                        onChangeText={setItemName}
                        placeholder="商品名"
                        placeholderTextColor="#9ca3af"
                        editable={!submitting}
                        maxLength={ITEM_NAME_MAX_LENGTH}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>カテゴリ</Text>
                      <View style={styles.choices}>
                        {CATEGORIES.map(entry => (
                          <Pressable
                            key={entry.id}
                            style={({ pressed }) => [
                              styles.choice,
                              category === entry.id && styles.choiceSelected,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => setCategory(entry.id)}
                            disabled={submitting}
                          >
                            <Text style={[styles.choiceLabel, category === entry.id && styles.choiceLabelSelected]}>
                              {entry.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <View style={styles.labelRow}>
                        <Text style={styles.fieldLabel}>代替品</Text>
                        <Text style={styles.hint}>{ALTERNATIVE_MAX_COUNT}件まで登録できます</Text>
                      </View>
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
                            <Text style={styles.value}>{name}</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                            onPress={() => handleRemoveAlternative(index)}
                            disabled={submitting}
                          >
                            <Text style={styles.removeButtonText}>削除</Text>
                          </Pressable>
                        </View>
                      ))}
                      <TextInput
                        style={styles.input}
                        value={alternativeInput}
                        onChangeText={setAlternativeInput}
                        placeholder={editingIndex === null ? '代替品を入力する' : '代替品を書き換える'}
                        placeholderTextColor="#9ca3af"
                        editable={!submitting}
                        maxLength={ALTERNATIVE_NAME_MAX_LENGTH}
                      />
                      <View style={styles.inlineButtons}>
                        <ActionButton
                          title={editingIndex === null ? '追加する' : '更新する'}
                          compact
                          half
                          onPress={handleSubmitAlternative}
                          disabled={submitting || alternativeInput.trim() === ''}
                        />
                        {editingIndex !== null && (
                          <ActionButton
                            title="編集をやめる"
                            compact
                            half
                            onPress={handleCancelAlternative}
                            disabled={submitting}
                          />
                        )}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>距離の上限（メートル）</Text>
                      <View>
                        <TextInput
                          style={[styles.input, maxDistanceText !== '' && styles.inputWithUnit]}
                          value={maxDistanceText}
                          onChangeText={setMaxDistanceText}
                          placeholder="家からの移動距離を指定する (任意)"
                          placeholderTextColor="#9ca3af"
                          keyboardType="number-pad"
                          editable={!submitting}
                        />
                        {maxDistanceText !== '' && (
                          <View style={styles.unit} pointerEvents="none">
                            <Text style={styles.unitText}>m</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>備考</Text>
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        value={note}
                        onChangeText={setNote}
                        placeholder="備考"
                        placeholderTextColor="#9ca3af"
                        multiline
                        editable={!submitting}
                        maxLength={NOTE_MAX_LENGTH}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>購入する店舗</Text>
                      <Text style={styles.value}>{preferredStoreName ?? '指定なし'}</Text>
                      {preferredStoreCategories !== null && (
                        <Text style={styles.note}>{storeCategoriesLabel(preferredStoreCategories)}</Text>
                      )}
                      <View style={styles.inlineButtons}>
                        <ActionButton
                          title="店舗を指定する"
                          compact
                          half
                          onPress={handleSelectStore}
                          disabled={submitting}
                        />
                        {preferredStoreId !== null && (
                          <ActionButton
                            title="指定を解除する"
                            compact
                            half
                            onPress={handleClearStore}
                            disabled={submitting}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                )}

                {error !== null && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.actions}>
                  {editing ? (
                    <>
                      <ActionButton
                        title={item === null ? '追加する' : '保存する'}
                        variant="primary"
                        onPress={handleSave}
                        disabled={submitting}
                      />
                      {item !== null && (
                        <ActionButton title="編集をやめる" onPress={handleCancelEditing} disabled={submitting} />
                      )}
                    </>
                  ) : (
                    <>
                      {chattable && (
                        <ActionButton title="チャット" onPress={handleOpenChat} disabled={submitting} />
                      )}
                      {switchable && !isRequested(item) && categoryRequestable && (
                        <View style={styles.switchCard}>
                          <View style={styles.switchRow}>
                            <Text style={styles.switchLabel}>重要な依頼にする</Text>
                            <Switch
                              value={importantSelected}
                              onValueChange={setIsImportant}
                              disabled={submitting || !importantAvailable}
                            />
                          </View>
                          <Text style={styles.note}>{importantNote}</Text>
                        </View>
                      )}
                      {switchable && !isRequested(item) && categoryNote !== null && (
                        <Text style={styles.note}>{categoryNote}</Text>
                      )}
                      {switchable && (isRequested(item) || categoryRequestable) && (
                        <ActionButton
                          title={isRequested(item) ? '依頼を取り下げる' : '依頼する'}
                          variant={isRequested(item) ? 'secondary' : 'primary'}
                          onPress={handleSwitchStatus}
                          disabled={submitting}
                        />
                      )}
                      {editable && (
                        <ActionButton title="編集する" onPress={() => setEditing(true)} disabled={submitting} />
                      )}
                      {deletable && (
                        <ActionButton
                          title="削除する"
                          variant="danger"
                          onPress={confirmDelete}
                          disabled={submitting}
                        />
                      )}
                    </>
                  )}
                </View>
              </ScrollView>
            </GestureDetector>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0006',
  },
  backdropTouch: {
    flex: 1,
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
    backgroundColor: '#d1d5db',
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111827',
  },
  warningBanner: {
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  warningText: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  form: {
    gap: 12,
  },
  header: {
    gap: 8,
  },
  itemName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#eef4fc',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06c',
  },
  importantBadge: {
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
  state: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#6b7280',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  rowLabel: {
    width: 96,
    color: '#6b7280',
    lineHeight: 22,
  },
  rowValue: {
    flex: 1,
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f4f6f8',
  },
  inputWithUnit: {
    paddingRight: 32,
  },
  unit: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  unitText: {
    color: '#6b7280',
  },
  multiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  choiceSelected: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  choiceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  choiceLabelSelected: {
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
    borderColor: '#dde3ea',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f4f6f8',
  },
  alternativeNameEditing: {
    borderColor: '#4682b4',
    backgroundColor: '#fff',
  },
  removeButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  removeButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#c00',
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  switchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ea',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 16,
    color: '#111827',
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde3ea',
  },
  actionButtonCompact: {
    paddingVertical: 9,
  },
  actionButtonHalf: {
    flex: 1,
  },
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
  },
  actionButtonDanger: {
    borderWidth: 0,
    backgroundColor: '#fff5f5',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  actionTitlePrimary: {
    color: '#fff',
  },
  actionTitleDanger: {
    color: '#c00',
  },
  pressed: {
    opacity: 0.7,
  },
});
