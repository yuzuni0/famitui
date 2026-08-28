import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { detectItems } from '../services/detectActions';
import { createItem } from '../services/item';
import { updateStockStandard } from '../services/stockStandard';
import type { CameraMode, DetectedItem, StandardLabel } from '../types/firestore';
//撮影した画像から不足品を判定する画面

type Props = {
  familyId: string;
  uid: string;
  storagePath: string;
  mode: CameraMode;
};

//現在の状態を表す
const MODE_LABELS: Record<CameraMode, string> = {
  baseline: '基準を登録する',
  detect: '不足品を検出する',
};

//同じラベルが並んでも一覧の鍵が重ならないようにする
function itemKey(item: DetectedItem, index: number): string {
  return `${item.label}_${index}`;
}

export default function DetectionResultPage({ familyId, uid, storagePath, mode }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  //判定の前は null
  const [detected, setDetected] = useState<DetectedItem[] | null>(null);
  //mode が 'detect' の場合のみ入る
  const [missing, setMissing] = useState<DetectedItem[] | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  //画面の表示時に1回だけ判定する
  useEffect(() => {
    //撮影のやり直しで対象が変わった時は判定前の状態に戻す
    let active = true;
    setDetected(null);
    setMissing(null);
    setSelectedLabels(new Set());
    setError(null);
    setLoading(true);

    detectItems(familyId, storagePath, mode)
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
  }, [familyId, storagePath, mode]);

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

    navigation.navigate('ItemList');
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
          autoNotifyEnabled: false,
          preferredStoreId: null,
        });
      } catch (submitError) {
        //既に登録した品目はそのまま残す
        setError(`「${item.itemName}」で失敗しました。${errorMessage(submitError)}`);
        setSubmitting(false);
        return;
      }
    }

    navigation.navigate('ItemList');
  }

  //判定には10秒以上かかる場合がある
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.note}>判定しています…</Text>
      </View>
    );
  }

  //判定に失敗した場合は撮影からやり直す
  if (detected === null) {
    return (
      <View style={styles.loading}>
        <Text style={styles.error}>{error ?? '判定に失敗しました。'}</Text>
        <Button title="戻る" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const selectedCount = selectedLabels.size;

  return (
    <View style={styles.container}>
      <Text style={styles.mode}>{MODE_LABELS[mode]}</Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {mode === 'detect' && missing !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>不足している可能性のある品目</Text>

            {/* 基準が無い場合も候補は空になる */}
            {missing.length === 0 ? (
              <Text style={styles.empty}>
                基準が登録されていません。先に基準を登録してください。
              </Text>
            ) : (
              missing.map((item, index) => {
                const selected = selectedLabels.has(item.label);
                return (
                  <Pressable
                    key={itemKey(item, index)}
                    style={[styles.item, selected && styles.itemSelected]}
                    onPress={() => handlePressItem(item)}
                    disabled={submitting}
                  >
                    <Text style={styles.itemName}>{item.itemName}</Text>
                    <Text style={styles.meta}>{item.label}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {mode === 'detect' ? '写っていた品目' : '検出された品目'}
          </Text>

          {detected.length === 0 ? (
            <Text style={styles.empty}>品目を検出できませんでした。</Text>
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

              const selected = selectedLabels.has(item.label);
              return (
                <Pressable
                  key={itemKey(item, index)}
                  style={[styles.item, selected && styles.itemSelected]}
                  onPress={() => handlePressItem(item)}
                  disabled={submitting}
                >
                  <Text style={styles.itemName}>{item.itemName}</Text>
                  <Text style={styles.meta}>{item.label}</Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {mode === 'baseline' ? (
        <Button
          title={`基準として登録する（${selectedCount}件）`}
          onPress={handleSubmitBaseline}
          disabled={submitting}
        />
      ) : missing !== null && missing.length === 0 ? (
        //基準の登録へ促す
        <Button
          title="基準を登録する"
          onPress={() => navigation.navigate('Camera', { mode: 'baseline' })}
          disabled={submitting}
        />
      ) : (
        <Button
          title={`不足品として追加する（${selectedCount}件）`}
          onPress={handleSubmitMissing}
          disabled={submitting}
        />
      )}

      <Button title="やめる" onPress={() => navigation.goBack()} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  list: {
    gap: 12,
  },
  section: {
    gap: 12,
  },
  mode: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  item: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    gap: 4,
  },
  itemSelected: {
    borderColor: '#06c',
    backgroundColor: '#eaf2fb',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  meta: {
    color: '#666',
  },
  note: {
    textAlign: 'center',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});