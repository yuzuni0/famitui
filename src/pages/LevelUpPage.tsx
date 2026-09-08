import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { Animated, Button, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_LABELS, importantRequestLimit, requestableCategories } from '../lib/level';
import type { MainStackParamList } from '../navigation/RootNavigator';

//レベル上昇の画面
type Props = {
  previousLevel: number;
  newLevel: number;
  addedScore: number;
};

//レベルアップの影響を示す
function unlockedLines(previousLevel: number, newLevel: number): string[] {
  const lines: string[] = [];
  const previousLimit = importantRequestLimit(previousLevel);
  const newLimit = importantRequestLimit(newLevel);

  if (newLimit > previousLimit) {
    lines.push(`重要な依頼が1日${newLimit}回まで使えるようになりました`);
  }

  //新しいカテゴリの依頼を許可する
  const previousCategories = new Set(requestableCategories(previousLevel));
  const unlocked = requestableCategories(newLevel).filter(
    category => !previousCategories.has(category),
  );
  if (unlocked.length > 0) {
    const labels = unlocked.map(category => CATEGORY_LABELS[category]).join('、');
    lines.push(`${labels}の依頼ができるようになりました`);
  }

  return lines;
}

export default function LevelUpPage({ previousLevel, newLevel, addedScore }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  //表示時のアニメーション
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, bounciness: 8, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  const lines = unlockedLines(previousLevel, newLevel);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <Text style={styles.title}>レベルアップ！</Text>
        <Text style={styles.level}>
          レベル {previousLevel} → {newLevel}
        </Text>
        <Text style={styles.score}>スコア +{addedScore}</Text>

        {lines.map(line => (
          <Text key={line} style={styles.unlocked}>
            {line}
          </Text>
        ))}
      </Animated.View>

      <Button title="閉じる" onPress={() => navigation.popToTop()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 24,
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#06c',
    borderRadius: 8,
    backgroundColor: '#eaf2fb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#06c',
  },
  level: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  score: {
    fontSize: 16,
    color: '#666',
  },
  unlocked: {
    textAlign: 'center',
  },
});