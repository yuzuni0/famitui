import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { uploadPhoto } from '../../services/device/photo';
import { createItem } from '../../services/firestore/item';
import { observeStockStandard, updateStockStandard } from '../../services/firestore/stockStandard';
import { detectItems } from '../../services/functions/detectActions';
import type { CameraMode, DetectedItem, StandardLabel, StockStandardDoc } from '../../types/firestore';
//撮影した画像から不足品を判定する画面

type Props = {
  familyId: string;
  uid: string;
  localUri: string;
  mode: CameraMode;
};

type ActionButtonProps = {
  title: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
};

function ActionButton({ title, primary = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]}>{title}</Text>
    </Pressable>
  );
}

//同じラベルが並んでも一覧の鍵が重ならないようにする
function itemKey(item: DetectedItem, index: number): string {
  return `${item.label}_${index}`;
}

export default function DetectionResultPage({ familyId, uid, localUri, mode }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  //判定の前は null
  const [detected, setDetected] = useState<DetectedItem[] | null>(null);
  //mode が 'detect' の場合のみ入る
  const [missing, setMissing] = useState<DetectedItem[] | null>(null);
  const [standard, setStandard] = useState<StockStandardDoc | null | undefined>(undefined);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  //画面の表示時に判定する
  useEffect(() => {
    //撮影のやり直しで対象が変わった時は判定前の状態に戻す
    let active = true;
    setDetected(null);
    setMissing(null);
    setSelectedLabels(new Set());
    setError(null);
    setLoading(true);

    uploadPhoto(familyId, localUri)
      .then(storagePath => detectItems(familyId, storagePath, mode))
      .then(result => {
        if (!active) {
          return;
        }

        setDetected(result.detected);
        setMissing(mode === 'detect' ? result.missing ?? [] : null);

        //初期状態ではすべてを選択済みにする
        const targets = mode === 'detect' ? result.missing ?? [] : result.detected;
        setSelectedLabels(new Set(targets.map(item => item.label)));
        setLoading(false);
      })
      .catch(detectError => {
        if (!active) {
          return;
        }

        setError(errorMessage(detectError, 'detectItems'));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [familyId, localUri, mode]);

  //基準が無いのと不足が無いのを区別する
  useEffect(() => {
    setStandard(undefined);
    const unsubscribe = observeStockStandard(familyId, setStandard, observeError => {
      setError(errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId]);

  //選択と解除を切り替える
  function handlePressItem(item: DetectedItem) {
    if (submitting) {
      return;
    }

    setSelectedLabels(previous => {
      const next = new Set(previous);
      if (next.has(item.label)) {
        next.delete(item.label);
      } else {
        next.add(item.label);
      }
      return next;
    });
  }

  //選んだ品目を基準として登録する
  async function handleSubmitBaseline() {
    if (submitting || detected === null) {
      return;
    }

    //同じラベルが複数ある場合は後のものが前を上書きする
    const labelMap = new Map<string, StandardLabel>();
    for (const item of detected.filter(entry => selectedLabels.has(entry.label))) {
      labelMap.set(item.label, { label: item.label, category: item.category });
    }

    const labels = Array.from(labelMap.values());
    if (labels.length === 0) {
      setError('品目を1つ以上選んでください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updateStockStandard(familyId, uid, labels);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
      return;
    }

    navigation.popTo('Home');
  }

  //選んだ候補を不足品として順に登録する
  async function handleSubmitMissing() {
    if (submitting || missing === null) {
      return;
    }

    const targets = missing.filter(item => selectedLabels.has(item.label));
    if (targets.length === 0) {
      setError('品目を1つ以上選んでください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    //途中で失敗した時に、登録できた品目を確認する
    for (const item of targets) {
      try {
        await createItem(familyId, uid, {
          itemName: item.itemName,
          category: item.category,
          //後から AddMissingModal で編集できる
          alternativeItemNames: [],
          maxDistanceMeters: null,
          note: '',
          preferredStoreId: null,
        });
      } catch (submitError) {
        //既に登録した品目はそのまま残す
        setError(`「${item.itemName}」で失敗しました。${errorMessage(submitError)}`);
        setSubmitting(false);
        return;
      }
    }

    navigation.popTo('Home');
  }

  //判定には10秒以上かかる場合がある
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>判定しています…</Text>
      </View>
    );
  }

  //判定に失敗した場合は撮影からやり直す
  if (detected === null) {
    return (
      <View style={styles.loading}>
        <View style={[styles.errorBanner, styles.loadingBanner]}>
          <Text style={styles.errorText}>{error ?? '判定に失敗しました。'}</Text>
        </View>
      </View>
    );
  }

  const selectedCount = selectedLabels.size;

  const noStandard = standard === null || (standard !== undefined && standard.labels.length === 0);

  const noMissing = mode === 'detect' && missing !== null && missing.length === 0 && !noStandard;

  //選択できる項目
  function renderSelectable(item: DetectedItem, index: number) {
    const selected = selectedLabels.has(item.label);
    return (
      <Pressable
        key={itemKey(item, index)}
        style={({ pressed }) => [
          styles.item,
          selected && styles.itemSelected,
          pressed && styles.itemPressed,
        ]}
        onPress={() => handlePressItem(item)}
        disabled={submitting}
      >
        <Text style={styles.itemName}>{item.itemName}</Text>
        <Text style={styles.meta}>{item.label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.guide}>
        {mode === 'detect' ? '不足品として追加する品目を選んでください。' : '基準として登録する品目を選んでください。'}
      </Text>

      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView style={styles.listContainer} contentContainerStyle={styles.list}>
        {mode === 'detect' && missing !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>不足している可能性のある品目</Text>

            {missing.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {noStandard
                    ? '基準が登録されていません。先に基準を登録してください。'
                    : '不足品はありませんでした。基準の品目はすべて写っています。'}
                </Text>
              </View>
            ) : (
              missing.map(renderSelectable)
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {mode === 'detect' ? '写っていた品目' : '検出された品目'}
          </Text>

          {detected.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>品目を検出できませんでした。</Text>
            </View>
          ) : (
            detected.map((item, index) => {
              //参考として並べるだけなので、'detect' では選択できない
              if (mode === 'detect') {
                return (
                  <View key={itemKey(item, index)} style={styles.item}>
                    <Text style={styles.itemName}>{item.itemName}</Text>
                    <Text style={styles.meta}>{item.label}</Text>
                  </View>
                );
              }
              return renderSelectable(item, index);
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {submitting ? (
          <View style={[styles.actionButton, styles.actionButtonPrimary]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : mode === 'baseline' ? (
          <ActionButton
            title={`基準として登録する（${selectedCount}件）`}
            primary
            disabled={false}
            onPress={handleSubmitBaseline}
          />
        ) : noMissing ? (
          //ホームへ戻るだけ
          <ActionButton
            title="ホームに戻る"
            primary
            disabled={false}
            onPress={() => navigation.popTo('Home')}
          />
        ) : missing !== null && missing.length === 0 ? (
          //基準の登録へ促す
          <ActionButton
            title="基準を登録する"
            primary
            disabled={false}
            onPress={() => navigation.navigate('Camera', { mode: 'baseline' })}
          />
        ) : (
          <ActionButton
            title={`不足品として追加する（${selectedCount}件）`}
            primary
            disabled={false}
            onPress={handleSubmitMissing}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#F7F9FC',
  },
  loadingText: {
    color: '#6b7280',
  },
  loadingBanner: {
    alignSelf: 'stretch',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  guide: {
    marginHorizontal: 16,
    marginTop: 16,
    color: '#6b7280',
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topBanner: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: -7,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemSelected: {
    borderColor: '#06c',
    backgroundColor: '#eef4fc',
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  meta: {
    color: '#6b7280',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 16,
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
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
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
});
